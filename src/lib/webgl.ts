/**
 * Whether this browser can run the map at all.
 *
 * MapLibre v6 dropped WebGL1, and it does not offer a capability check of its
 * own: `isSupported()` was removed in 3.0.0-pre.6. Worse, 6.6.0's constructor
 * does not *throw* on a missing context - it fires an `ErrorEvent` that upstream
 * acknowledges cannot be caught, because it is emitted before the caller has an
 * instance to attach a listener to. So asking first is the only way to answer
 * this without an uncatchable error, and the check is a canvas and one
 * `getContext` call.
 *
 * Wrapped in a `try` because the failure it guards against is a browser without
 * the API rather than one that answers `null` politely, and a hardened or
 * headless environment can throw from either call.
 *
 * Nothing is lost when this comes back false: a dive site's coordinates remain
 * typeable, which was the picker's design premise before there was a map.
 */
export function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") != null;
  } catch {
    return false;
  }
}
