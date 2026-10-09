"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiveSectionIcon } from "@/components/dives/dive-section-icon";
import {
  DiveFormSectionsTrigger,
  scrollToSection,
  useDiveFormSectionRegistry,
} from "@/components/dives/dive-form-sections";
import type { DiveFormFieldGroup } from "@/lib/dive-form-fields";
import { cn } from "@/lib/utils";

type DiveFormSectionProps = {
  // The group's name is the heading, and names the glyph beside it.
  title: DiveFormFieldGroup;
  // Nothing in the content is visible, so it drops its padding and the card is all
  // heading. Its children stay mounted - a status region among them, say.
  empty?: boolean;
  children: ReactNode;
} & (
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      action?: never;
      titleAdornment?: never;
    }
  | {
      // Takes the chevron's place, and the section no longer collapses.
      action: ReactNode;
      // Sits right after the title - an info popover, say.
      titleAdornment?: ReactNode;
      open?: never;
      onOpenChange?: never;
    }
);

// One of the dive form's field groups, a card of its own. The heading sticks under the
// site header while its card scrolls past, and the card being its containing block is
// what hands the spot to the next heading: this one leaves with its card's bottom edge.
//
// A collapsed section unmounts its fields, as a hidden field is not rendered - their
// values stay in form state (`shouldUnregister: false`) and are submitted all the same.
export function DiveFormSection(props: DiveFormSectionProps) {
  const { title, empty = false, children } = props;
  const open = props.onOpenChange === undefined || props.open;
  const contentId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLButtonElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [passed, setPassed] = useState(false);

  // The sentinel sits one header-height above the card, so it leaves the top of the
  // viewport exactly when the card's top passes under the site header - the moment
  // the heading starts sticking. Leaving at the bottom is not that, hence the side.
  //
  // The section index reads the same sentinel one step more generously: a jump
  // lands a card exactly on that line, where the heading is not yet stuck and a
  // tap on it still collapses, but the reader is plainly in that section. The
  // sentinel is a pixel tall and sits inside the card's 1px border, so with the
  // card's top on the line its bottom edge is 2px below the viewport's top; a root
  // shrunk by 3px counts it gone there and not a pixel higher, an edge touching
  // the root's still being an intersection. "At or above", where `stuck` is "above".
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const above = (entry: IntersectionObserverEntry) =>
      !entry.isIntersecting &&
      entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
    const stuckObserver = new IntersectionObserver(([entry]) =>
      setStuck(above(entry)),
    );
    const passedObserver = new IntersectionObserver(
      ([entry]) => setPassed(above(entry)),
      { rootMargin: "-3px 0px 0px 0px" },
    );
    stuckObserver.observe(sentinel);
    passedObserver.observe(sentinel);
    return () => {
      stuckObserver.disconnect();
      passedObserver.disconnect();
    };
  }, []);

  // The form's section index lists what reports here, and reads the sentinel's
  // answer to tell which section the reader is in.
  const registry = useDiveFormSectionRegistry();
  useEffect(() => {
    const card = cardRef.current;
    if (!registry || !card) return;
    registry.register(title, {
      element: card,
      focus: () => (headingRef.current ?? card).focus({ preventScroll: true }),
    });
    return () => registry.unregister(title);
  }, [registry, title]);
  useEffect(() => {
    registry?.setPassed(title, passed);
  }, [registry, title, passed]);

  const shown = open && !empty;
  // Where the index is not beside the form, the stuck heading carries it: the
  // reader is a long way from the top, which is where the page's own controls are.
  const sectionsTrigger = shown && stuck && (
    <DiveFormSectionsTrigger className="lg:hidden" />
  );

  return (
    // Focusable so a jump from the index can land the keyboard on a card whose
    // heading has no control of its own.
    <Card ref={cardRef} tabIndex={-1} className="relative outline-none">
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none absolute -top-(--header-height) h-px w-px"
      />
      {/* Squared off at the foot while content shows, so content scrolling under the
          stuck heading cannot show through its corners. Padded evenly rather than
          with the title's lift, which would leave the chevron off the heading's
          middle. A card that is all heading never sticks and takes no rule. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card pt-(--card-pad)",
          !shown && "rounded-b-lg",
          // A shadow rather than a border: it takes no height, so the rule appearing
          // neither nudges the fields nor pulls the chevron off the middle.
          shown && stuck && "shadow-[inset_0_-1px_0_hsl(var(--border))]",
        )}
      >
        {props.onOpenChange === undefined ? (
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h2" className="flex items-center gap-1">
              <DiveSectionIcon group={title} className="mr-1" />
              {title}
              {/* No height of its own: a touch screen's 44px floor would otherwise
                  stretch the title's line, and the box beyond its icon is invisible. */}
              <span className="flex h-0 items-center">
                {props.titleAdornment}
              </span>
            </CardTitle>
            {/* Overhangs the title's line into the heading's padding, so the heading
                is as tall as every other section's - on a touch screen nearly so,
                where the button's floor is 44px. */}
            <div className="-my-2 flex items-center gap-2">
              {props.action}
              {sectionsTrigger}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <CardTitle as="h2" className="min-w-0 grow">
              <button
                ref={headingRef}
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={() => {
                  // A stuck heading is a way back to the top of its section, which
                  // collapsing would throw away by moving everything below it.
                  if (open && stuck) {
                    if (cardRef.current) scrollToSection(cardRef.current);
                    return;
                  }
                  props.onOpenChange(!open);
                }}
                className="relative flex w-full items-center justify-between gap-2 rounded-sm text-left touch:tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DiveSectionIcon group={title} />
                  {title}
                </span>
                {/* Stuck, a tap on the heading scrolls rather than collapses, so the
                    chevron says nothing there; on a narrow screen the sections
                    control takes its place rather than widening the heading. */}
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    !open && "-rotate-90",
                    sectionsTrigger && "max-lg:hidden",
                  )}
                />
              </button>
            </CardTitle>
            {/* As tall as the chevron's line once its margins are counted, so the
                heading does not move when the control appears. */}
            {sectionsTrigger && (
              <div className="-my-1 -mr-1 flex items-center">
                {sectionsTrigger}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      {/* The heading's even padding is `--card-pad`, which a phone halves; the rest of
          the first field's gap is made up here, so it sits as far below the heading as
          the fields sit from each other. */}
      <CardContent
        id={contentId}
        hidden={!open}
        className={cn(
          "space-y-6 pt-[calc(--spacing(6)-var(--card-pad))]",
          empty && "p-0",
        )}
      >
        {open && children}
      </CardContent>
    </Card>
  );
}
