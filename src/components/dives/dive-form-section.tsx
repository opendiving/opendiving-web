"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  CARD_SECTION_CONTENT,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DIVE_SECTION_ICONS,
  DiveSectionIcon,
} from "@/components/dives/dive-section-icon";
import {
  SectionIndexTrigger,
  SectionSentinel,
  scrollToSection,
  useSection,
  useSectionIndexShown,
} from "@/components/ui/section-index";
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
      // Takes the chevron's place, and the section doesn't collapse.
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
  const { cardRef, headingRef, sentinelRef, stuck } = useSection({
    key: title,
    label: title,
    icon: DIVE_SECTION_ICONS[title],
    onExpand: () => props.onOpenChange?.(true),
  });
  const indexShown = useSectionIndexShown();

  const shown = open && !empty;
  // Where the index is not beside the form, the stuck heading carries it: the
  // reader is a long way from the top, which is where the page's own controls are.
  const sectionsTrigger = shown && stuck && indexShown && (
    <SectionIndexTrigger className="lg:hidden" />
  );

  return (
    // Focusable so a jump from the index can land the keyboard on a card whose
    // heading has no control of its own.
    <Card ref={cardRef} tabIndex={-1} className="relative outline-none">
      <SectionSentinel ref={sentinelRef} />
      {/* Squared off at the foot while content shows, so content scrolling under the
          stuck heading cannot show through its corners. A card that is all heading
          never sticks and takes no rule. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card",
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
                heading does not move when the control appears. Hidden as a whole
                where the control is, since an empty flex item still costs the row
                its gap and would nudge the chevron as the heading sticks. */}
            {sectionsTrigger && (
              <div className="-my-1 -mr-1 flex items-center lg:hidden">
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
        className={cn("space-y-6", CARD_SECTION_CONTENT, empty && "p-0")}
      >
        {open && children}
      </CardContent>
    </Card>
  );
}
