export class ResourceRegistry {
  #entries = [];
  #seen = new WeakSet();
  #disposed = false;

  get size() {
    return this.#entries.length;
  }

  get disposed() {
    return this.#disposed;
  }

  register(resource, disposer) {
    if (this.#disposed) throw new Error("ResourceRegistry is already disposed");
    if (!isObject(resource) || this.#seen.has(resource)) return resource;
    const dispose = disposer ?? inferDisposer(resource);
    if (!dispose) return resource;
    this.#seen.add(resource);
    this.#entries.push({resource, dispose});
    return resource;
  }

  registerObject3D(root) {
    if (!root || typeof root.traverse !== "function") {
      throw new TypeError("registerObject3D requires a traversable root");
    }
    root.traverse((object) => {
      this.register(object.geometry);
      for (const material of asArray(object.material)) this.registerMaterial(material);
      if (object.skeleton) {
        const skeleton = object.skeleton;
        const boneTexture = skeleton.boneTexture;
        this.register(skeleton, (item) => {
          // Three Skeleton.dispose() owns boneTexture. The registry owns it
          // separately so shared resources are still released exactly once.
          if (item.boneTexture === boneTexture) item.boneTexture = null;
          item.dispose?.();
        });
        this.register(boneTexture);
      }
    });
    return root;
  }

  registerMaterial(material) {
    if (!isObject(material)) return material;
    this.register(material);
    for (const value of Object.values(material)) {
      if (!isObject(value)) continue;
      if (value.isTexture) {
        this.registerTexture(value);
      } else if (value.isWebGLRenderTarget) {
        this.register(value);
        this.registerTexture(value.texture);
        this.registerTexture(value.depthTexture);
      }
    }
    return material;
  }

  registerTexture(texture) {
    if (!isObject(texture)) return texture;
    this.register(texture);
    const source = texture.source;
    if (isObject(source)) {
      this.register(source, (item) => {
        item.dispose?.();
        item.data = null;
      });
      this.registerCloseable(source.data);
    }
    this.registerCloseable(texture.image);
    return texture;
  }

  registerCloseable(value) {
    if (Array.isArray(value)) {
      for (const item of value) this.registerCloseable(item);
    } else if (isObject(value) && typeof value.close === "function") {
      this.register(value, (item) => item.close());
    }
    return value;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    const failures = [];
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const {resource, dispose} = this.#entries[index];
      try {
        dispose(resource);
      } catch (error) {
        failures.push(error);
      }
    }
    this.#entries.length = 0;
    if (failures.length) throw new AggregateError(failures, "One or more viewer resources failed to dispose");
  }
}

function inferDisposer(resource) {
  if (!isObject(resource)) return null;
  if (typeof resource.dispose === "function") return (item) => item.dispose();
  if (typeof resource.close === "function") return (item) => item.close();
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isObject(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
