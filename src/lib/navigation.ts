// A full document navigation - a page load, not one of Next's client-side
// route transitions.
//
// It's a one-line wrapper for a reason: `window.location` is unforgeable, so a
// test can neither spy on `assign` nor swap the object out, and calling it for
// real under jsdom only produces a "Not implemented: navigation" error. Going
// through a module gives the handful of places that genuinely need a page load
// something a test can mock, and somewhere to say why they need one.

let leaving = false;

export function hardNavigate(path: string): void {
  leaving = true;
  window.location.assign(path);
}

// Whether this document is on its way out. Effects that would otherwise start a
// client-side navigation should stand down once it is - the page load is going
// to win, so all they can do is spend a request on a route nobody will see.
//
// Deliberately module state, not React state: nothing needs to re-render on it,
// it's only ever read from an effect that runs after it's set, and it is never
// unset, because the document it belongs to is being replaced.
export function isLeavingPage(): boolean {
  return leaving;
}
