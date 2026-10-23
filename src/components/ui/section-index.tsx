"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { TableOfContents } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A page's sections as a list to jump by: which are on the page, which the reader
// is in, and the way to each. Every section reports itself here as it mounts and
// as it scrolls under the header, so the list follows the page without restating
// the rules its sections are rendered under. The dive form's field groups read
// this way, and a trip's parts.

export type SectionIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

interface SectionHandle {
  label: string;
  icon: SectionIcon;
  element: HTMLElement;
  // Puts the keyboard where the jump landed: on the section's heading where it
  // has a control, else on the card itself.
  focus: () => void;
  // Puts the section's content on the page for a jump: unfolds a folded one, or
  // sets loading one that is not drawn yet.
  reveal: () => void;
}

interface SectionRecord extends SectionHandle {
  // The card's top is at or above the site header's line.
  passed: boolean;
}

interface SectionRegistry {
  register: (key: string, handle: SectionHandle, passed: boolean) => void;
  unregister: (key: string) => void;
  setPassed: (key: string, passed: boolean) => void;
}

export interface SectionIndexEntry {
  key: string;
  label: string;
  icon: SectionIcon;
}

interface SectionIndexState {
  /** The sections on the page, in page order. */
  entries: readonly SectionIndexEntry[];
  /** The section the viewport is in. */
  active: string | undefined;
  /** Puts the section's content on the page and scrolls its card under the site header. */
  jump: (key: string) => void;
}

export interface SectionIndex {
  registry: SectionRegistry;
  state: SectionIndexState;
}

// Two contexts rather than one: the registry never changes, so a section's
// effects can depend on it without re-running every time the reader scrolls.
const RegistryContext = createContext<SectionRegistry | null>(null);
const IndexContext = createContext<SectionIndexState | null>(null);

/** What says the reader has taken the scroll over from a jump. */
export const READER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"];
// How long a card holds still before the scroll carrying it counts as over, and
// how long one the page will not bring any closer is waited on - a page of the
// list above it can still be loading.
const SETTLE_MS = 100;
const GIVE_UP_MS = 2000;
// However long the list is still loading.
const FOLLOW_MAX_MS = 30_000;

let stopSettling: (() => void) | null = null;

/**
 * Scrolls a section's card to the top of the viewport. `html`'s
 * `scroll-padding-top` lands it under the site header.
 *
 * And follows it while the page moves under the scroll: a list above the card
 * loads its next page as the scroll passes it, and the scroll ends where the card
 * was rather than where it is. Each time the card holds still off the line it is
 * scrolled to again, until it is on the line or has stayed where the page lets it
 * come for a while - or the reader scrolls or presses anything, jumps again, or
 * half a minute has gone.
 */
export function scrollToSection(element: HTMLElement) {
  stopSettling?.();
  const scroll = () =>
    element.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  scroll();

  const line =
    parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
    0;
  let frame = 0;
  let lastTop = element.getBoundingClientRect().top;
  const started = performance.now();
  let movedAt = started;
  let retriedFrom = Number.NaN;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of READER_INPUT)
      window.removeEventListener(type, stop, true);
    if (stopSettling === stop) stopSettling = null;
  };
  const tick = () => {
    const now = performance.now();
    if (now - started > FOLLOW_MAX_MS) return stop();
    const { top } = element.getBoundingClientRect();
    if (Math.abs(top - lastTop) >= 1) {
      lastTop = top;
      movedAt = now;
    }
    if (now - movedAt > SETTLE_MS) {
      if (Math.abs(top - line) <= 2) return stop();
      if (top !== retriedFrom) {
        retriedFrom = top;
        scroll();
      } else if (now - movedAt > GIVE_UP_MS) {
        return stop();
      }
    }
    frame = requestAnimationFrame(tick);
  };
  for (const type of READER_INPUT)
    window.addEventListener(type, stop, { capture: true, passive: true });
  stopSettling = stop;
  frame = requestAnimationFrame(tick);
}

const documentOrder = (a: HTMLElement, b: HTMLElement) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/**
 * The index over a page's sections, owned by the page and handed down through
 * `SectionIndexProvider`. The entries run in the order the cards sit in the
 * document, or in `order` where the page names one.
 */
export function useSectionIndex(order?: readonly string[]): SectionIndex {
  const [records, setRecords] = useState<ReadonlyMap<string, SectionRecord>>(
    () => new Map(),
  );

  const registry = useMemo<SectionRegistry>(
    () => ({
      register: (key, handle, passed) =>
        setRecords((current) =>
          new Map(current).set(key, { ...handle, passed }),
        ),
      unregister: (key) =>
        setRecords((current) => {
          const next = new Map(current);
          next.delete(key);
          return next;
        }),
      setPassed: (key, passed) =>
        setRecords((current) => {
          const record = current.get(key);
          if (!record || record.passed === passed) return current;
          return new Map(current).set(key, { ...record, passed });
        }),
    }),
    [],
  );

  const entries = useMemo(() => {
    const keys = [...records.keys()].sort(
      order
        ? (a, b) => order.indexOf(a) - order.indexOf(b)
        : (a, b) =>
            documentOrder(records.get(a)!.element, records.get(b)!.element),
    );
    return keys.map((key) => {
      const { label, icon } = records.get(key)!;
      return { key, label, icon };
    });
  }, [records, order]);

  // The reader is in the last section whose top has passed the header's line: every
  // section above it has passed too, and the one below has not. None passed is the
  // top of the page, which is the first section.
  const active =
    [...entries].reverse().find((entry) => records.get(entry.key)?.passed)
      ?.key ?? entries[0]?.key;

  const jump = useCallback(
    (key: string) => {
      const record = records.get(key);
      if (!record) return;
      record.reveal();
      scrollToSection(record.element);
      record.focus();
    },
    [records],
  );
  const state = useMemo<SectionIndexState>(
    () => ({ entries, active, jump }),
    [entries, active, jump],
  );

  return { registry, state };
}

export function SectionIndexProvider({
  index,
  children,
}: {
  index: SectionIndex;
  children: ReactNode;
}) {
  return (
    <RegistryContext.Provider value={index.registry}>
      <IndexContext.Provider value={index.state}>
        {children}
      </IndexContext.Provider>
    </RegistryContext.Provider>
  );
}

interface UseSectionOptions {
  key: string;
  // The section's name and glyph in the index.
  label: string;
  icon: SectionIcon;
  // Off for a section the index leaves out at this width; the heading still
  // reports whether it is stuck.
  listed?: boolean;
  // Unfolds the section, for a jump that lands on it folded.
  onExpand?: () => void;
}

/**
 * One section of a page: whether its sticky heading is stuck, and its place in
 * the page's index, where there is one. The card takes `cardRef` and is
 * `relative`, with `SectionSentinel` as its first child; a heading control takes
 * `headingRef`, so a jump lands the keyboard on it.
 */
export function useSection({
  key,
  label,
  icon,
  listed = true,
  onExpand,
}: UseSectionOptions) {
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLButtonElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [passed, setPassed] = useState(false);

  // The sentinel sits one header-height above the card, so it leaves the top of the
  // viewport exactly when the card's top passes under the site header - the moment
  // the heading starts sticking.
  //
  // The index reads the same sentinel one step more generously: a jump lands a card
  // exactly on that line, where the heading is not yet stuck and a tap on it still
  // folds, but the reader is plainly in that section. The sentinel is a pixel tall
  // and sits inside the card's 1px border, so with the card's top on the line its
  // bottom edge is 2px below the viewport's top: "at or above" counts it there and
  // not a pixel higher, where `stuck` is "above".
  //
  // Both are read off the sentinel's box, which every observer's entry carries, so
  // any of them can answer. Two fire as it crosses those lines. An observer fires
  // only when its target goes in or out of its root, though, and a jump that
  // carries the sentinel from below the viewport to above it in one step - the
  // index without smooth scrolling, a dragged scrollbar - crosses neither; the
  // third's root runs from the viewport's foot up past the top of any page, so
  // that jump is the sentinel entering it.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const update = ([entry]: IntersectionObserverEntry[]) => {
      const { bottom } = entry.boundingClientRect;
      setStuck(bottom < 0);
      setPassed(bottom < 3);
    };
    const observers = ["0px", "-3px 0px 0px 0px", "100000% 0px 0px 0px"].map(
      (rootMargin) => new IntersectionObserver(update, { rootMargin }),
    );
    for (const observer of observers) observer.observe(sentinel);
    return () => {
      for (const observer of observers) observer.disconnect();
    };
  }, []);

  // Read at the jump rather than registered, so a caller's inline callback does not
  // register the section again on every render.
  const onExpandRef = useRef(onExpand);
  useEffect(() => {
    onExpandRef.current = onExpand;
  });
  // A registration that comes again - a renamed section - carries on from where the
  // reader is rather than from the top.
  const passedRef = useRef(passed);

  const registry = useContext(RegistryContext);
  useEffect(() => {
    const card = cardRef.current;
    if (!registry || !card || !listed) return;
    registry.register(
      key,
      {
        label,
        icon,
        element: card,
        focus: () =>
          (headingRef.current ?? card).focus({ preventScroll: true }),
        reveal: () => onExpandRef.current?.(),
      },
      passedRef.current,
    );
    return () => registry.unregister(key);
  }, [registry, key, label, icon, listed]);
  useEffect(() => {
    passedRef.current = passed;
    if (listed) registry?.setPassed(key, passed);
  }, [registry, key, passed, listed]);

  return { cardRef, headingRef, sentinelRef, stuck };
}

interface UseSectionToComeOptions {
  key: string;
  label: string;
  icon: SectionIcon;
  // Starts bringing the section onto the page, for a jump to it.
  onReach: () => void;
}

/**
 * A section the page has not drawn yet - its content is on a page of a list
 * still to load - listed where it will be. The anchor it returns goes on an empty
 * element where the section will appear, which a jump scrolls to while `onReach`
 * loads the list on and lands on the section once it is drawn. The drawn section
 * takes over the key.
 */
export function useSectionToCome({
  key,
  label,
  icon,
  onReach,
}: UseSectionToComeOptions) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const onReachRef = useRef(onReach);
  useEffect(() => {
    onReachRef.current = onReach;
  });
  const registry = useContext(RegistryContext);
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!registry || !anchor) return;
    registry.register(
      key,
      {
        label,
        icon,
        element: anchor,
        // Nothing to focus until the section is drawn.
        focus: () => {},
        reveal: () => onReachRef.current(),
      },
      false,
    );
    return () => registry.unregister(key);
  }, [registry, key, label, icon]);
  return anchorRef;
}

/** What `useSection` watches, placed as the card's first child. */
export function SectionSentinel({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute -top-(--header-height) h-px w-px"
    />
  );
}

/** Whether the page's index has more than one section to list. */
export function useSectionIndexShown() {
  const index = useContext(IndexContext);
  return (index?.entries.length ?? 0) > 1;
}

interface SectionIndexNavProps {
  className?: string;
  // Fires before the jump, for a container that has to close around it.
  onNavigate?: () => void;
}

/**
 * The list of the page's sections, the one the reader is in marked: beside them
 * on a wide screen, and in a popover from a stuck heading on a narrow one. A page
 * of one section lists nothing.
 */
export function SectionIndexNav({
  className,
  onNavigate,
}: SectionIndexNavProps) {
  const index = useContext(IndexContext);
  if (!index || index.entries.length < 2) return null;
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex flex-col gap-0.5">
        {index.entries.map(({ key, label, icon: Icon }) => {
          const current = key === index.active;
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={current ? "location" : undefined}
                onClick={() => {
                  onNavigate?.();
                  index.jump(key);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium touch:py-3",
                  current
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {/* One text line tall, so a name that wraps leaves the glyph on its
                    first line. */}
                <span className="flex h-5 shrink-0 items-center">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The index as a popover, from a control a stuck heading shows on a narrow
 * screen - where there is no room beside the sections, and the reader is as far
 * from the top of the page as the heading is stuck. Nothing for a page of one
 * section.
 */
export function SectionIndexTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // A pick moves focus to the section it jumped to; closing any other way hands
  // it back to this control, as a popover does.
  const picked = useRef(false);
  const shown = useSectionIndexShown();
  if (!shown) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <IconTooltip label="Sections">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "relative h-7 w-7 text-muted-foreground touch:min-h-0 touch:min-w-0 touch:tap-target",
              className,
            )}
          >
            <TableOfContents className="h-5 w-5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </IconTooltip>
      {/* As wide as its longest name up to a cap, past which names wrap. */}
      <PopoverContent
        align="end"
        className="w-max min-w-56 max-w-72 p-1"
        onCloseAutoFocus={(event) => {
          if (!picked.current) return;
          picked.current = false;
          event.preventDefault();
        }}
      >
        <SectionIndexNav
          onNavigate={() => {
            picked.current = true;
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
