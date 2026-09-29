"use client";

import { useCallback, useEffect, useState } from "react";

import { isAbortError } from "@/lib/api/client";
import { fetchAllTags, type Tag } from "@/lib/api/tags";

export interface TagsState {
  /** The diver's tags by name, or `null` until the first read lands. */
  tags: Tag[] | null;
  /** Whether the last read failed. */
  loadFailed: boolean;
  /** Reads them again; a no-op while `enabled` is false. */
  reload: () => void;
}

/**
 * Every tag the diver has, read whole - the picker, the list's filter and the
 * Tags card each offer the lot, and a diver keeps a handful.
 *
 * `enabled` is whether anything on screen wants them yet: the list's filter is
 * behind a button, so most visits to it never need this request. It is read once
 * and kept; `reload` reads it again after a rename or a delete.
 */
export function useTags(enabled: boolean = true): TagsState {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    fetchAllTags(controller.signal)
      .then((all) => {
        setTags(all);
        setLoadFailed(false);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        console.error("Failed to read the tags:", error);
        setLoadFailed(true);
      });

    return () => controller.abort();
  }, [enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { tags, loadFailed, reload };
}
