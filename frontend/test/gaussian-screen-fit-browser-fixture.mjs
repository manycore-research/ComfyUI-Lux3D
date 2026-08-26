import {
  PlyLoader,
  RenderMode,
  SceneRevealMode,
  Viewer,
} from "/node_modules/@mkkellogg/gaussian-splats-3d/build/gaussian-splats-3d.module.js";
import * as THREE from "three";

window.gaussianFixtureReady = true;

window.renderGaussianQuadFixture = async function renderGaussianQuadFixture(fixture) {
  if (THREE.REVISION !== "183") {
    throw new Error(`Gaussian runtime resolved Three ${THREE.REVISION}, expected 183`);
  }
  if (fixture.splats.length !== 1) {
    throw new Error("Browser parity fixtures must render one original splat at a time");
  }

  const root = document.createElement("div");
  root.style.width = `${fixture.viewportWidth}px`;
  root.style.height = `${fixture.viewportHeight}px`;
  root.style.position = "absolute";
  root.style.left = "0";
  root.style.top = "0";
  document.body.appendChild(root);

  let viewer;
  let renderTarget;
  try {
    viewer = new Viewer({
      rootElement: root,
      cameraUp: [0, -1, -0.6],
      initialCameraPosition: [fixture.target[0], fixture.target[1], fixture.target[2] - fixture.distance],
      initialCameraLookAt: fixture.target,
      sharedMemoryForWorkers: false,
      gpuAcceleratedSort: false,
      integerBasedSort: false,
      antialiased: true,
      maxScreenSpaceSplatSize: fixture.maxScreenSpaceSplatSize ?? 1024,
      kernel2DSize: 0.3,
      sphericalHarmonicsDegree: 0,
      focalAdjustment: 1,
      selfDrivenMode: false,
      useBuiltInControls: false,
      enableSIMDInSort: false,
      renderMode: RenderMode.OnChange,
      sceneRevealMode: SceneRevealMode.Instant,
    });

    // Version 0.4.6 uses renderSplatCount as the indexed draw range. Replicate
    // the same source splat six times so its six-index quad is submitted.
    const shaderSplats = Array.from({length: 6}, () => fixture.splats[0]);
    const ply = buildGaussianPly(shaderSplats);
    const splatBuffer = await PlyLoader.loadFromFileData(ply, 1, 0, true, 0);
    await viewer.addSplatBuffers(
      [splatBuffer],
      [{
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        splatAlphaRemovalThreshold: 1,
      }],
      true,
      false,
      false,
      true,
      false,
      false,
    );

    viewer.camera.position.set(
      fixture.target[0],
      fixture.target[1],
      fixture.target[2] - fixture.distance,
    );
    viewer.camera.up.set(0, -1, -0.6).normalize();
    viewer.camera.lookAt(...fixture.target);
    viewer.camera.fov = 50;
    viewer.camera.aspect = fixture.viewportWidth / fixture.viewportHeight;
    viewer.camera.near = fixture.near;
    viewer.camera.far = fixture.far;
    viewer.camera.updateProjectionMatrix();
    viewer.camera.updateMatrixWorld(true);

    const mesh = viewer.getSplatMesh();
    const vertexShader = mesh.material.vertexShader;
    const shaderContractPresent = [
      "const float sqrt8 = sqrt(8.0)",
      "float s = 1.0 / (viewCenter.z * viewCenter.z)",
      "cov2Dm[0][0] += 0.3",
      "float term2 = sqrt(max(0.1f",
      "min(sqrt8 * sqrt(eigenValue1), 1024.0)",
    ].every((fragment) => vertexShader.includes(fragment));

    mesh.material.fragmentShader = `
      precision highp float;
      void main() {
        gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
      }
    `;
    mesh.material.transparent = false;
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    mesh.material.blending = THREE.NoBlending;
    mesh.material.needsUpdate = true;

    viewer.update();
    const renderer = viewer.renderer;
    const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = drawingBufferSize.x;
    const height = drawingBufferSize.y;
    renderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(new THREE.Color(0x000000), 0);
    renderer.clear(true, true, true);
    renderer.compile(mesh, viewer.camera);
    renderer.render(mesh, viewer.camera);
    const gl = renderer.getContext();
    gl.finish();
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let pixelCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (pixels[offset] < 128 || pixels[offset + 2] < 128) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixelCount += 1;
      }
    }

    const decodedColor = new THREE.Vector4();
    mesh.getSplatColor(0, decodedColor);
    return {
      threeRevision: THREE.REVISION,
      shaderContractPresent,
      devicePixelRatio: window.devicePixelRatio,
      width,
      height,
      viewport: mesh.material.uniforms.viewport.value.toArray(),
      basisViewport: mesh.material.uniforms.basisViewport.value.toArray(),
      focal: mesh.material.uniforms.focal.value.toArray(),
      decodedAlpha: decodedColor.w,
      pixelCount,
      glError: gl.getError(),
      bounds: pixelCount > 0 ? {minX, maxX: maxX + 1, minY, maxY: maxY + 1} : null,
    };
  } finally {
    if (viewer?.renderer) viewer.renderer.setRenderTarget(null);
    if (renderTarget) renderTarget.dispose();
    if (viewer) await viewer.dispose();
    root.remove();
  }
};

function buildGaussianPly(splats) {
  const properties = [
    "x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
    "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3",
  ];
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    `element vertex ${splats.length}`,
    ...properties.map((property) => `property float ${property}`),
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const data = new ArrayBuffer(splats.length * properties.length * 4);
  const view = new DataView(data);
  splats.forEach((splat, row) => {
    const values = {
      x: splat.center[0], y: splat.center[1], z: splat.center[2],
      nx: 0, ny: 0, nz: 0,
      f_dc_0: 1, f_dc_1: 0, f_dc_2: 1,
      opacity: opacityForAlpha(splat.alpha),
      scale_0: Math.log(splat.scale[0]),
      scale_1: Math.log(splat.scale[1]),
      scale_2: Math.log(splat.scale[2]),
      rot_0: splat.rotation[3],
      rot_1: splat.rotation[0],
      rot_2: splat.rotation[1],
      rot_3: splat.rotation[2],
    };
    properties.forEach((property, column) => {
      view.setFloat32((row * properties.length + column) * 4, values[property], true);
    });
  });
  const file = new Uint8Array(headerBytes.length + data.byteLength);
  file.set(headerBytes);
  file.set(new Uint8Array(data), headerBytes.length);
  return file.buffer;
}

function opacityForAlpha(alpha) {
  if (!Number.isInteger(alpha) || alpha < 1 || alpha > 254) {
    throw new Error(`Fixture alpha must be an integer in [1, 254], received ${alpha}`);
  }
  const probability = (alpha + 0.5) / 255;
  return Math.log(probability / (1 - probability));
}
