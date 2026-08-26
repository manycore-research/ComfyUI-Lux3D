/* @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0.
 * Adapted from @google/model-viewer 4.2.0 EnvironmentScene.
 */

import {ResourceRegistry} from "../lifecycle/resource-registry.js";

export const MODEL_VIEWER_ENVIRONMENT_BLUR_RADIANS = 0.04;
export const MODEL_VIEWER_ENVIRONMENT_SIZE = 256;
export const MODEL_VIEWER_LEGACY_EXPOSURE_COMPENSATION = 1.3;

const LEGACY_ENVIRONMENT = Object.freeze({
  topLight: Object.freeze({intensity: 500, position: Object.freeze([0.418, 16.199, 0.300])}),
  room: Object.freeze({
    position: Object.freeze([-0.757, 13.219, 0.717]),
    scale: Object.freeze([31.713, 28.305, 28.591]),
  }),
  boxes: Object.freeze([
    Object.freeze({position: Object.freeze([-10.906, 2.009, 1.846]), rotation: -0.195, scale: Object.freeze([2.328, 7.905, 4.651])}),
    Object.freeze({position: Object.freeze([-5.607, -0.754, -0.758]), rotation: 0.994, scale: Object.freeze([1.970, 1.534, 3.955])}),
    Object.freeze({position: Object.freeze([6.167, 0.857, 7.803]), rotation: 0.561, scale: Object.freeze([3.927, 6.285, 3.687])}),
    Object.freeze({position: Object.freeze([-2.017, 0.018, 6.124]), rotation: 0.333, scale: Object.freeze([2.002, 4.566, 2.064])}),
    Object.freeze({position: Object.freeze([2.291, -0.756, -2.621]), rotation: -0.286, scale: Object.freeze([1.546, 1.552, 1.496])}),
    Object.freeze({position: Object.freeze([-2.193, -0.369, -5.547]), rotation: 0.516, scale: Object.freeze([3.875, 3.487, 2.986])}),
  ]),
  lights: Object.freeze([
    Object.freeze({intensity: 50, position: Object.freeze([-16.116, 14.37, 8.208]), scale: Object.freeze([0.1, 2.428, 2.739])}),
    Object.freeze({intensity: 50, position: Object.freeze([-16.109, 18.021, -8.207]), scale: Object.freeze([0.1, 2.425, 2.751])}),
    Object.freeze({intensity: 17, position: Object.freeze([14.904, 12.198, -1.832]), scale: Object.freeze([0.15, 4.265, 6.331])}),
    Object.freeze({intensity: 43, position: Object.freeze([-0.462, 8.89, 14.520]), scale: Object.freeze([4.38, 5.441, 0.088])}),
    Object.freeze({intensity: 20, position: Object.freeze([3.235, 11.486, -12.541]), scale: Object.freeze([2.5, 2.0, 0.1])}),
    Object.freeze({intensity: 100, position: Object.freeze([0.0, 20.0, 0.0]), scale: Object.freeze([1.0, 0.1, 1.0])}),
  ]),
});

export function generateModelViewerLegacyEnvironment(three, renderer) {
  const {scene, dispose} = createLegacyEnvironmentScene(three);
  const generator = new three.PMREMGenerator(renderer);
  const outputColorSpace = renderer.outputColorSpace;
  const toneMapping = renderer.toneMapping;
  try {
    renderer.toneMapping = three.NoToneMapping;
    renderer.outputColorSpace = three.LinearSRGBColorSpace;
    const target = generator.fromScene(
      scene,
      MODEL_VIEWER_ENVIRONMENT_BLUR_RADIANS,
      0.1,
      100,
      {size: MODEL_VIEWER_ENVIRONMENT_SIZE},
    );
    target.texture.name = "legacy";
    return target;
  } finally {
    renderer.toneMapping = toneMapping;
    renderer.outputColorSpace = outputColorSpace;
    generator.dispose();
    dispose();
  }
}

function createLegacyEnvironmentScene(three) {
  const registry = new ResourceRegistry();
  const scene = new three.Scene();
  scene.position.y = -3.5;

  const geometry = new three.BoxGeometry();
  geometry.deleteAttribute("uv");
  const roomMaterial = new three.MeshStandardMaterial({metalness: 0, side: three.BackSide});
  const boxMaterial = new three.MeshStandardMaterial({metalness: 0});

  const mainLight = new three.PointLight(0xffffff, LEGACY_ENVIRONMENT.topLight.intensity, 28, 2);
  mainLight.position.fromArray(LEGACY_ENVIRONMENT.topLight.position);
  scene.add(mainLight);

  const room = new three.Mesh(geometry, roomMaterial);
  room.position.fromArray(LEGACY_ENVIRONMENT.room.position);
  room.scale.fromArray(LEGACY_ENVIRONMENT.room.scale);
  scene.add(room);

  for (const box of LEGACY_ENVIRONMENT.boxes) {
    const mesh = new three.Mesh(geometry, boxMaterial);
    mesh.position.fromArray(box.position);
    mesh.rotation.set(0, box.rotation, 0);
    mesh.scale.fromArray(box.scale);
    scene.add(mesh);
  }

  for (const light of LEGACY_ENVIRONMENT.lights) {
    const material = new three.MeshBasicMaterial();
    material.color.setScalar(light.intensity);
    const mesh = new three.Mesh(geometry, material);
    mesh.position.fromArray(light.position);
    mesh.scale.fromArray(light.scale);
    scene.add(mesh);
  }

  registry.registerObject3D(scene);
  return {scene, dispose: () => registry.dispose()};
}
