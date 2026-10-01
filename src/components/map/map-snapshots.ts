// Pictures of `LocationsMap`s that have finished drawing, kept for the page's
// lifetime so a map scrolled away and back, or a window resized under it, is
// shown again rather than drawn again.

export interface MapSnapshot {
  url: string;
  // The frame it was fitted for, as `LocationsMap` describes one.
  drawnFor: string;
  // Where each marker stood, in CSS pixels from the picture's top-left.
  pins: { x: number; y: number; variant: "pin" | "fix"; name: string }[];
}

// Keyed by everything that decides what the picture shows, so a changed place
// or theme is a miss rather than a stale picture. Bounded, oldest first out.
const snapshots = new Map<string, MapSnapshot>();
const MAX_SNAPSHOTS = 100;

export function findSnapshot(key: string): MapSnapshot | undefined {
  return snapshots.get(key);
}

// Replacing a key's picture - one drawn again because a resize pushed a pin out
// of the frame - drops the old one's bytes too.
export function rememberSnapshot(key: string, snapshot: MapSnapshot) {
  const replaced = snapshots.get(key);
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  if (replaced) URL.revokeObjectURL(replaced.url);
  if (snapshots.size <= MAX_SNAPSHOTS) return;
  const [oldestKey, oldest] = snapshots.entries().next().value!;
  snapshots.delete(oldestKey);
  URL.revokeObjectURL(oldest.url);
}
