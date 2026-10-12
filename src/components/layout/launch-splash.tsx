"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// A conveyor of bubbles: each climbs to the next one's place and takes on its size.
// The top one settles in its slot and fades there while the next rises into it, and a
// new one grows at the bottom. At every whole step the last three bubbles are the
// circles of `Logo` (`components/logo.tsx`), smallest filled; the first slot sits on
// their line, as far below the smallest as 0.6 of the gap above it. `hole` is the
// radius left unpainted inside each ring. One bubble per slot, so the four circles
// drawn below match these four.
const SLOTS = [
  { x: 1.84, y: 24.22, r: 0, hole: 0 },
  { x: 5.17, y: 20.22, r: 1.78, hole: 0 },
  { x: 10.72, y: 13.56, r: 2.89, hole: 1.89 },
  { x: 16.83, y: 5.78, r: 3.78, hole: 2.78 },
];
type Key = "x" | "y" | "r" | "hole";
const STEP_MS = 800;
const STROKE = 2;
const TOP = SLOTS.length - 1;
// How far ahead of the top slot, as a share of a step, the top bubble starts to fade.
const FADE_LEAD = 0.75;
const MIN_VISIBLE_MS = 1000;
const LANDING_PATHS = ["/", "/join"];
const FADE_OUT_MS = 300;

// Hermite tangents keep position and speed continuous through each slot, so the
// bubbles glide past the mark rather than ticking between its circles. The top slot's
// is zero: a bubble comes to rest there instead of overshooting.
function tangent(i: number, key: Key) {
  if (i === TOP) return 0;
  const prev = i === 0 ? 2 * SLOTS[0][key] - SLOTS[1][key] : SLOTS[i - 1][key];
  return (SLOTS[i + 1][key] - prev) / 2;
}

function hermite(from: number, to: number, key: Key, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * SLOTS[from][key] +
    (t3 - 2 * t2 + t) * tangent(from, key) +
    (3 * t2 - 2 * t3) * SLOTS[to][key] +
    (t3 - t2) * tangent(to, key)
  );
}

function ease(t: number) {
  return t * t * (3 - 2 * t);
}

function bubble(i: number, elapsed: number) {
  const p = (elapsed / STEP_MS + i) % SLOTS.length;
  const k = Math.floor(p);
  const f = p - k;
  const at = (key: Key) => hermite(k, Math.min(k + 1, TOP), key, f);

  const grow = k === 0 ? ease(f) : 1;
  // A step-long fade, started FADE_LEAD early while the bubble still rises into its slot.
  // Except for the bubble the first frame puts in the top slot: that frame is the whole
  // mark, so this one fades from where it sits, across the first step.
  const lead = i === TOP && elapsed < STEP_MS ? 0 : FADE_LEAD;
  const fade = 1 - ease(Math.min(1, Math.max(0, p - (TOP - lead))));
  // Drawn from its outer edge and its hole, so a dot opens into a ring STROKE thick.
  const outer = at("r") + (STROKE / 2) * grow;
  const hole = Math.max(0, Math.min(at("hole"), outer - STROKE));
  return {
    cx: at("x").toFixed(3),
    cy: at("y").toFixed(3),
    r: ((outer + hole) / 2).toFixed(3),
    strokeWidth: (outer - hole).toFixed(3),
    opacity: fade.toFixed(3),
  };
}

// Step 0 is the mark itself, so the server renders it and the first paint is the logo,
// still, until hydration sets it moving.
const FIRST_FRAME = SLOTS.map((_, i) => bubble(i, 0));

// When the splash first reached the screen. It is server-rendered, so first contentful
// paint is the splash itself - well before hydration, on a slow connection.
function shownAt() {
  const [paint] = performance.getEntriesByName("first-contentful-paint");
  return paint?.startTime ?? performance.now();
}

/**
 * The full-screen animated logo over a document's first load, held for at least
 * `MIN_VISIBLE_MS` and until the session is resolved, in place of the header skeleton
 * and centred spinner the auth gate otherwise shows. It lives in the root layout,
 * which client navigation never remounts, so it plays once per load.
 *
 * Not over the landing page, at `/` or under `/join`'s invite form, which is the
 * product's pitch to a visitor rather than the app starting. Decided by the path the
 * document loaded on, so a signed-in diver redirected from there to `/home` does not
 * get it late.
 */
export function LaunchSplash({ nonce }: { nonce?: string }) {
  const { isLoading } = useAuth();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">(() =>
    LANDING_PATHS.includes(pathname) ? "gone" : "shown",
  );

  useEffect(() => {
    if (isLoading || phase !== "shown") return;
    const wait = Math.max(0, shownAt() + MIN_VISIBLE_MS - performance.now());
    const timer = setTimeout(() => setPhase("leaving"), wait);
    return () => clearTimeout(timer);
  }, [isLoading, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("gone"), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <>
      {/* Only an effect takes the splash down, so without scripts it would cover the
          page for good. */}
      <noscript>
        <style nonce={nonce}>{"#launch-splash{display:none}"}</style>
      </noscript>
      <Splash leaving={phase === "leaving"} />
    </>
  );
}

function Splash({ leaving }: { leaving: boolean }) {
  const circles = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let frame = 0;
    let start: number | undefined;
    const loop = (now: number) => {
      start ??= now;
      circles.current.forEach((circle, i) => {
        if (!circle) return;
        const b = bubble(i, now - start!);
        circle.setAttribute("cx", b.cx);
        circle.setAttribute("cy", b.cy);
        circle.setAttribute("r", b.r);
        circle.setAttribute("stroke-width", b.strokeWidth);
        circle.setAttribute("opacity", b.opacity);
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      id="launch-splash"
      role="status"
      aria-label="Loading OpenDiving"
      className="fixed inset-0 z-[100] grid place-items-center bg-coral text-white transition-opacity ease-out motion-reduce:transition-none data-[leaving]:pointer-events-none data-[leaving]:opacity-0"
      style={
        {
          "--mark": "min(22vmin, 160px)",
          transitionDuration: `${FADE_OUT_MS}ms`,
        } as CSSProperties
      }
      data-leaving={leaving ? "" : undefined}
    >
      {/* Sits above true centre, which reads as low: by the usual optical lift, plus
          the distance the bubbles' weight drops below their box over a loop. */}
      <div
        aria-hidden="true"
        className="flex flex-col items-center gap-[calc(var(--mark)*0.28)] -translate-y-[calc(var(--mark)*0.07+3dvh)]"
      >
        {/* The viewBox is cropped to the circles' painted extent, stroke included,
            rather than the mark's 24-unit box, so the grid centres what is drawn.
            `--mark` is the width of 26 units; the crop is 19.72 of them. */}
        <svg
          viewBox="2.14 0.75 19.72 22.5"
          fill="none"
          stroke="currentColor"
          className="h-auto w-[calc(var(--mark)*19.72/26)] overflow-visible"
        >
          {FIRST_FRAME.map((b, i) => (
            <circle
              key={i}
              ref={(el) => {
                circles.current[i] = el;
              }}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              strokeWidth={b.strokeWidth}
              opacity={b.opacity}
            />
          ))}
        </svg>
        <span className="font-wordmark text-[calc(var(--mark)*0.4)] font-bold leading-none tracking-wordmark">
          OpenDiving
        </span>
      </div>
    </div>
  );
}
