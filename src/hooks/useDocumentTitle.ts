"use client";

import { useEffect } from "react";

import { pageTitle } from "@/lib/page-title";

/**
 * Names the tab after something only the browser knows - a dive site's name, loaded
 * after sign-in - within its `section`, on a page whose `metadata` could only name the
 * section. The tab goes back to that when the page does, unless navigation has already
 * renamed it: Next keeps a left route hidden under `<Activity>`, and its cleanup runs
 * after the next route's title is in place.
 */
export function useDocumentTitle(name: string | undefined, section?: string) {
  useEffect(() => {
    if (!name) return;
    const previous = document.title;
    const title = pageTitle(name, section);
    document.title = title;
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [name, section]);
}
