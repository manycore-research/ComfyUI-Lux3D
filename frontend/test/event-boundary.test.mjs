import assert from "node:assert/strict";
import test from "node:test";

import {installViewerEventBoundary} from "../src/viewer/comfy/event-boundary.js";
import {FakeEventTarget} from "./viewer-test-helpers.mjs";

test("adapter target receives input before the host boundary stops Comfy propagation", () => {
  const host = new FakeEventTarget();
  host.tabIndex = -1;
  host.focusCalls = [];
  host.focus = (options) => host.focusCalls.push(options);
  const dispose = installViewerEventBoundary(host);
  const order = [];
  const event = {
    type: "pointerdown",
    cancelable: true,
    stopPropagation() {
      this.propagationStopped = true;
      order.push("boundary");
    },
  };

  order.push("adapter-control");
  host.listeners.get("pointerdown")[0].listener(event);
  if (!event.propagationStopped) order.push("comfy-canvas");
  assert.deepEqual(order, ["adapter-control", "boundary"]);
  assert.equal(host.tabIndex, 0);
  assert.deepEqual(host.focusCalls, [{preventScroll: true}]);
  dispose();
  dispose();
  assert.equal(host.listeners.get("pointerdown").length, 0);
});

test("wheel is non-passive, prevented, and stopped only at the viewer host", () => {
  const host = new FakeEventTarget();
  const dispose = installViewerEventBoundary(host);
  const registration = host.listeners.get("wheel")[0];
  assert.deepEqual(registration.options, {passive: false});
  const event = host.dispatch("wheel");
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  dispose();
});

test("does not install keyboard or global listeners", () => {
  const host = new FakeEventTarget();
  const dispose = installViewerEventBoundary(host);
  assert.equal(host.listeners.has("keydown"), false);
  assert.equal(host.listeners.has("keyup"), false);
  assert.equal(host.listeners.has("keypress"), false);
  dispose();
});

test("allows pointer dragging only while the captured pointer remains inside the viewer", () => {
  const host = new FakeEventTarget();
  host.getBoundingClientRect = () => ({left: 10, top: 20, right: 110, bottom: 120});
  const dispose = installViewerEventBoundary(host);
  const registration = host.listeners.get("pointermove")[0];
  assert.equal(registration.options, true);

  const inside = host.dispatch("pointermove", {clientX: 109, clientY: 119});
  assert.equal(inside.propagationStopped, undefined);

  const outsideRight = host.dispatch("pointermove", {clientX: 110, clientY: 50});
  assert.equal(outsideRight.propagationStopped, true);
  const outsideTop = host.dispatch("pointermove", {clientX: 50, clientY: 19});
  assert.equal(outsideTop.propagationStopped, true);

  assert.equal(host.listeners.has("pointerup"), false);
  assert.equal(host.listeners.has("pointercancel"), false);
  dispose();
  assert.equal(host.listeners.get("pointermove").length, 0);
});
