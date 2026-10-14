// The header's bell reads `/gear-service-due` on each navigation, but a schedule,
// a service record, a dive or a gear item saved on the page under it moves a due
// figure without one - and there is no shared cache between them to notice. The API
// calls that can move one announce it here, so every route to them is covered.

const target = new EventTarget();
const CHANGED = "service-due-changed";

/** Tells the bell that what is due may have changed. */
export function announceServiceDueChanged(): void {
  target.dispatchEvent(new Event(CHANGED));
}

/** Calls `listener` on each announcement; returns the unsubscribe. */
export function onServiceDueChanged(listener: () => void): () => void {
  target.addEventListener(CHANGED, listener);
  return () => target.removeEventListener(CHANGED, listener);
}
