"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
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
// whichever entry holds `--settings-nav-shown`, so moving the name slides it there. A
// browser without anchor positioning drops the `anchor()` insets, leaving a pill with
// no size, and gives the entry its own background instead.
const PILL =
  "relative isolate before:pointer-events-none before:absolute before:-z-10 before:rounded-md before:bg-muted before:[position-anchor:--settings-nav-shown] before:[top:anchor(top)] before:[right:anchor(right)] before:[bottom:anchor(bottom)] before:[left:anchor(left)] motion-safe:before:transition-[inset] motion-safe:before:duration-300 motion-safe:before:ease-[cubic-bezier(0.33,1,0.68,1)]";

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
  const hasScrolled = useRef(false);

  // The entry clicked, shown as selected from the click rather than from whenever the
  // route arrives, so the pill and the row move together straight away. Any change of
  // pathname ends it, a return to the page it was clicked on included - which is what
  // a swipe back is - so it is cleared during render, on the change itself.
  const [clicked, setClicked] = useState<string>();
  const [pathnameSeen, setPathnameSeen] = useState(pathname);
  if (pathname !== pathnameSeen) {
    setPathnameSeen(pathname);
    setClicked(undefined);
  }
  const shown = clicked ?? pathname;

  // On a phone the row is wider than the screen, and a section further along it would
  // otherwise open with its own entry out of sight. The row is scrolled rather than the
  // entry scrolled into view, which would move the page as well; where the list is a
  // column it has nothing to scroll and this does nothing. The first placement is
  // instant, since there is nothing yet to move from.
  useEffect(() => {
    const list = listRef.current;
    const entry = list?.querySelector<HTMLElement>(`a[href="${shown}"]`);
    if (!list || !entry) return;
    const row = list.getBoundingClientRect();
    const box = entry.getBoundingClientRect();
    const from = list.scrollLeft;
    const to = Math.min(
      Math.max(0, from + box.left + box.width / 2 - (row.left + row.width / 2)),
      list.scrollWidth - list.clientWidth,
    );
    const glide =
      hasScrolled.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hasScrolled.current = true;
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
  }, [shown]);

  const select = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens a tab and leaves this page where it is.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (href !== pathname) setClicked(href);
  };

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
          "-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0",
          PILL,
        )}
      >
        {sections.map(({ href, label, icon: Icon }) => {
          const isShown = href === shown;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                onClick={select(href)}
                aria-current={pathname === href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isShown
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
