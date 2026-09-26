"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ClipboardList,
  KeyRound,
  MailPlus,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from "lucide-react";

import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { cn } from "@/lib/utils";

interface SettingsSection {
  href: string;
  label: string;
  icon: LucideIcon;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "/settings/account", label: "Account", icon: User },
  { href: "/settings/checkin", label: "Check-in", icon: ClipboardList },
  {
    href: "/settings/authentication",
    label: "Authentication",
    icon: KeyRound,
  },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  {
    href: "/settings/preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { href: "/settings/invitations", label: "Invitations", icon: MailPlus },
];

// The selection is one pill, the list's `::before`, tethered by anchor positioning to
// whichever entry holds `--settings-nav-shown`, so moving the name moves it there. A
// browser without anchor positioning drops the `anchor()` insets, leaving a pill with
// no size, and gives the entry its own background instead.
const PILL =
  "relative isolate before:pointer-events-none before:absolute before:-z-10 before:rounded-md before:bg-muted before:[position-anchor:--settings-nav-shown] before:[top:anchor(top)] before:[right:anchor(right)] before:[bottom:anchor(bottom)] before:[left:anchor(left)]";
const PILL_SLIDE =
  "motion-safe:before:transition-[inset] motion-safe:before:duration-300 motion-safe:before:ease-[cubic-bezier(0.33,1,0.68,1)] data-instant:before:transition-none";

// An entry's text colour, on the pill's timing and switched off with it: Safari snapshots
// the page as its URL changes, just after the pill sets off, and a colour already at the
// next entry puts the selection in two places in the swipe back.
const LABEL_FADE =
  "motion-safe:transition-[color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)] group-data-instant/nav:transition-none";

// The row's scroll, timed to the pill: `GLIDE_MS` is its `duration-300` and
// `easeOutCubic` its `cubic-bezier(0.33,1,0.68,1)`. The pill rides inside the row, so on
// screen it moves by its own travel less the row's, and only matching timings make that
// one smooth line. The browser's smooth scroll takes a length of its own choosing, and
// the pill overshoots the edge while the row catches up.
const GLIDE_MS = 300;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// A column beside the section from `lg` up, and a row that scrolls sideways above it
// below that, so a phone keeps the section itself on the first screen.
export function SettingsNav() {
  const pathname = usePathname();
  const { config } = useInstanceConfig();
  const listRef = useRef<HTMLUListElement>(null);
  // The page the row was last placed for, and where the row stood as each page was
  // left. Safari snapshots a page as it is left, so after a swipe back the row starts
  // from there - where the snapshot showed it - and glides on to centre the entry,
  // rather than snapping from wherever the live row happened to be.
  const placedFor = useRef<string | null>(null);
  const leftAt = useRef(new Map<string, number>());

  // The pill and the row move when the pathname does, never ahead of it on the tap:
  // Safari snapshots the page being left as the URL changes, and a swipe back shows that
  // snapshot, so a pill already on its way would be caught halfway. After a swipe the
  // browser animated itself (`hasUAVisualTransition`) the pill and its label jump rather
  // than slide - the swipe was the move, and a slide once the live page replaces the
  // snapshot repeats it.
  //
  // Marked on the list itself, in the capture phase: the router's own `popstate`
  // listener is older than this one and can render the new page synchronously, so a
  // flag set later - or through React state - arrives after the pill has started.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) =>
      listRef.current?.toggleAttribute(
        "data-instant",
        event.hasUAVisualTransition === true,
      );
    window.addEventListener("popstate", onPopState, { capture: true });
    return () =>
      window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);

  // On a phone the row is wider than the screen, and a section further along it would
  // otherwise open with its own entry out of sight. The row is scrolled rather than the
  // entry scrolled into view, which would move the page as well; where the list is a
  // column it has nothing to scroll and this does nothing. The first placement is
  // instant, since there is nothing yet to move from. Before paint, so no frame shows
  // the row where it was.
  useLayoutEffect(() => {
    const list = listRef.current;
    const entry = list?.querySelector<HTMLElement>(`a[href="${pathname}"]`);
    if (!list || !entry) return;
    const previous = placedFor.current;
    placedFor.current = pathname;
    if (previous !== null && previous !== pathname) {
      leftAt.current.set(previous, list.scrollLeft);
    }
    const snapshot = leftAt.current.get(pathname);
    if (list.hasAttribute("data-instant") && snapshot !== undefined) {
      list.scrollLeft = snapshot;
    }
    const row = list.getBoundingClientRect();
    const box = entry.getBoundingClientRect();
    const from = list.scrollLeft;
    const to = Math.min(
      Math.max(0, from + box.left + box.width / 2 - (row.left + row.width / 2)),
      list.scrollWidth - list.clientWidth,
    );
    const glide =
      previous !== null &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!glide || to === from) {
      list.scrollLeft = to;
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / GLIDE_MS);
      list.scrollLeft = from + (to - from) * easeOutCubic(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // An instance anyone may register on has nobody to invite. Hidden only once the
  // config says so: while it loads, or if it failed, the entry stays, because the
  // page behind it answers for itself either way.
  const sections = SETTINGS_SECTIONS.filter(
    (section) =>
      section.href !== "/settings/invitations" ||
      config?.registration_mode !== "open",
  );

  return (
    <nav aria-label="Settings" className="lg:sticky lg:top-24 lg:self-start">
      <ul
        ref={listRef}
        className={cn(
          "group/nav -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0",
          PILL,
          PILL_SLIDE,
        )}
      >
        {sections.map(({ href, label, icon: Icon }) => {
          const current = pathname === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                // A tap slides, whatever the last change was.
                onClick={() => listRef.current?.removeAttribute("data-instant")}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                  LABEL_FADE,
                  current
                    ? "text-foreground [anchor-name:--settings-nav-shown] not-supports-[position-anchor:auto]:bg-muted"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
