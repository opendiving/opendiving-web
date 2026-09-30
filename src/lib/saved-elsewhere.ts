import type { Certification } from "@/lib/api/certifications";

// What a form opened over a page saved, for the page to take in. The header's bell
// opens the service log and the certification dialog over any page, and the page
// underneath may be showing what it just changed - with no shared cache between them
// to notice. Only saves made outside the page are announced: a page's own forms
// already update it.
export interface SavedElsewhere {
  "gear-service": { gearItemUuid: string };
  certification: { certification: Certification };
}

export type SavedElsewhereKind = keyof SavedElsewhere;

const target = new EventTarget();

/** Tells whatever is on screen that `kind` was saved from outside it. */
export function announceSavedElsewhere<K extends SavedElsewhereKind>(
  kind: K,
  detail: SavedElsewhere[K],
): void {
  target.dispatchEvent(new CustomEvent(kind, { detail }));
}

/** Calls `listener` on each announcement of `kind`; returns the unsubscribe. */
export function onSavedElsewhere<K extends SavedElsewhereKind>(
  kind: K,
  listener: (detail: SavedElsewhere[K]) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<SavedElsewhere[K]>).detail);
  target.addEventListener(kind, handle);
  return () => target.removeEventListener(kind, handle);
}
