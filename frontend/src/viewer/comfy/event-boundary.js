const BOUNDARY_EVENTS = Object.freeze([
  "pointerdown",
  "mousedown",
  "mousemove",
  "mouseup",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "wheel",
  "contextmenu",
  "dblclick",
]);

export function installViewerEventBoundary(host) {
  if (!host || typeof host.addEventListener !== "function" || typeof host.removeEventListener !== "function") {
    throw new TypeError("viewer event boundary requires an EventTarget host");
  }
  if (typeof host.tabIndex === "number" && host.tabIndex < 0) host.tabIndex = 0;

  const onBoundaryEvent = (event) => {
    if (event.type === "pointerdown" && typeof host.focus === "function") {
      host.focus({preventScroll: true});
    }
    if (event.type === "wheel" && event.cancelable) event.preventDefault();
    event.stopPropagation();
  };
  const onPointerMoveCapture = (event) => {
    const rectangle = host.getBoundingClientRect?.();
    if (!rectangle || !hasFinitePointerCoordinates(event)) return;
    const inside = event.clientX >= rectangle.left
      && event.clientX < rectangle.right
      && event.clientY >= rectangle.top
      && event.clientY < rectangle.bottom;
    if (!inside) event.stopPropagation();
  };
  host.addEventListener("pointermove", onPointerMoveCapture, true);
  for (const type of BOUNDARY_EVENTS) {
    host.addEventListener(type, onBoundaryEvent, type === "wheel" ? {passive: false} : false);
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    host.removeEventListener("pointermove", onPointerMoveCapture, true);
    for (const type of BOUNDARY_EVENTS) {
      host.removeEventListener(type, onBoundaryEvent, type === "wheel" ? {passive: false} : false);
    }
  };
}

function hasFinitePointerCoordinates(event) {
  return Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);
}
