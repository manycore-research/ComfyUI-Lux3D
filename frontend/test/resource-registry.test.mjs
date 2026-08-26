import assert from "node:assert/strict";
import test from "node:test";

import {ResourceRegistry} from "../src/viewer/lifecycle/resource-registry.js";

test("disposes shared scene resources exactly once and is idempotent", () => {
  const calls = [];
  const geometry = {dispose: () => calls.push("geometry")};
  const bitmap = {close: () => calls.push("bitmap")};
  const texture = {isTexture: true, image: bitmap, dispose: () => calls.push("texture")};
  const material = {map: texture, dispose: () => calls.push("material")};
  const skeleton = {boneTexture: texture, dispose: () => calls.push("skeleton")};
  const objects = [
    {geometry, material, skeleton},
    {geometry, material},
  ];
  const root = {traverse: (visit) => objects.forEach(visit)};

  const registry = new ResourceRegistry();
  registry.registerObject3D(root);
  registry.dispose();
  registry.dispose();

  assert.equal(calls.filter((value) => value === "geometry").length, 1);
  assert.equal(calls.filter((value) => value === "material").length, 1);
  assert.equal(calls.filter((value) => value === "texture").length, 1);
  assert.equal(calls.filter((value) => value === "bitmap").length, 1);
  assert.equal(calls.filter((value) => value === "skeleton").length, 1);
  assert.equal(registry.size, 0);
  assert.equal(registry.disposed, true);
});

test("aggregates disposal failures after attempting every resource", () => {
  const calls = [];
  const registry = new ResourceRegistry();
  registry.register({dispose: () => { calls.push("first"); throw new Error("first"); }});
  registry.register({dispose: () => calls.push("second")});
  assert.throws(() => registry.dispose(), AggregateError);
  assert.deepEqual(calls, ["second", "first"]);
});

test("clears shared texture sources and prevents Skeleton from disposing boneTexture twice", () => {
  const calls = [];
  const bitmap = {close: () => calls.push("bitmap")};
  const source = {data: bitmap};
  const sharedTexture = {
    isTexture: true,
    source,
    image: bitmap,
    dispose: () => calls.push("shared-texture"),
  };
  const boneTexture = {
    isTexture: true,
    source: {data: null},
    dispose: () => calls.push("bone-texture"),
  };
  const skeleton = {
    boneTexture,
    dispose() {
      calls.push("skeleton");
      this.boneTexture?.dispose();
      this.boneTexture = null;
    },
  };
  const material = {map: sharedTexture, emissiveMap: sharedTexture, dispose: () => calls.push("material")};
  const root = {
    traverse(visit) {
      visit({geometry: null, material, skeleton});
      visit({geometry: null, material});
    },
  };

  const registry = new ResourceRegistry();
  registry.registerObject3D(root);
  registry.dispose();

  for (const resource of ["bitmap", "shared-texture", "bone-texture", "skeleton", "material"]) {
    assert.equal(calls.filter((value) => value === resource).length, 1, resource);
  }
  assert.equal(source.data, null);
  assert.equal(skeleton.boneTexture, null);
});
