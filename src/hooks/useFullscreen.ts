"use client";

import { useEffect, useState } from "react";

/**
 * Whether a view fills the screen, with the ways in and out. The view is an
 * overlay the caller draws over the page while `fullscreen` is true.
 *
 * Where the browser allows it, the whole document goes fullscreen underneath,
 * so the overlay fills the screen rather than the window. The document rather
 * than the overlay, so a popover or tooltip portalled to `body` still shows.
 * iPhone Safari has no element fullscreen, and there the overlay fills the
 * window alone. Leaving the browser's fullscreen - Escape, or its own controls
 * - leaves the view too.
 *
 * @example
 * const { fullscreen, enter, exit } = useFullscreen();
 * <Button onClick={enter}>Full screen</Button>
 * <Dialog open={fullscreen} onOpenChange={(open) => !open && exit()} />
 */
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const follow = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", follow);
    return () => {
      document.removeEventListener("fullscreenchange", follow);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [fullscreen]);

  return {
    fullscreen,
    // Called from the click itself: a browser grants fullscreen only inside a
    // user gesture. A refusal leaves the overlay, which is the view regardless.
    enter: () => {
      setFullscreen(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    },
    exit: () => setFullscreen(false),
  };
}
