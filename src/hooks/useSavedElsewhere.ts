"use client";

import { useEffect, useRef } from "react";

import {
  onSavedElsewhere,
  type SavedElsewhere,
  type SavedElsewhereKind,
} from "@/lib/saved-elsewhere";

/**
 * Runs `listener` whenever a form opened over this page - the header bell's -
 * saves a `kind`, so the page can read again what it is showing of it.
 *
 * The listener is held in a ref, so an inline arrow function doesn't resubscribe
 * on every render.
 */
export function useSavedElsewhere<K extends SavedElsewhereKind>(
  kind: K,
  listener: (detail: SavedElsewhere[K]) => void,
): void {
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });

  useEffect(
    () => onSavedElsewhere(kind, (detail) => listenerRef.current(detail)),
    [kind],
  );
}
