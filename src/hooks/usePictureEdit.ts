"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { pictureEditPreviewUrl, type PictureEdit } from "@/lib/picture-edits";

/**
 * A form's pending picture edit, and the object URL its preview is drawn from.
 *
 * The setter is the one place that URL changes hands: the edit it replaces gives its
 * URL back unless the new one keeps it, so a slot re-picked three times holds one
 * image rather than three for the life of the page - and clearing the edit after a
 * save releases it the same way. Whatever is still held when the form unmounts is
 * swept, as the certification form's card files are.
 */
export function usePictureEdit(): [
  PictureEdit | null,
  (next: PictureEdit | null) => void,
] {
  const [edit, setEditState] = useState<PictureEdit | null>(null);
  // Read by the setter, which has to know what it is replacing without waiting for
  // a render - two calls in one handler would otherwise both see the same `edit`.
  const held = useRef<PictureEdit | null>(null);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const outstanding = urls.current;
    return () => {
      for (const url of outstanding) URL.revokeObjectURL(url);
      outstanding.clear();
    };
  }, []);

  const setEdit = useCallback((next: PictureEdit | null) => {
    const before = pictureEditPreviewUrl(held.current);
    const after = pictureEditPreviewUrl(next);
    if (before && before !== after) {
      URL.revokeObjectURL(before);
      urls.current.delete(before);
    }
    if (after) urls.current.add(after);
    held.current = next;
    setEditState(next);
  }, []);

  return [edit, setEdit];
}
