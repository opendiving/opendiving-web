"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { swallowClickOf } from "@/lib/swallow-click";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Same surface as the charts' hover cards - `bg-tooltip` rather than
        // `bg-popover`, which is declared the same colour as `--card` and would
        // read as cut out of whatever panel the button sits in. See "`--tooltip`
        // is its own surface token" in DECISIONS.md.
        //
        // `max-w-64` with normal wrapping, because these carry a whole
        // accessible name: "Sign out Chrome on macOS" is a realistic one and a
        // `whitespace-nowrap` chip would run off the viewport on a phone.
        "z-50 max-w-64 rounded-md border border-white/10 bg-tooltip px-2 py-1 text-xs text-tooltip-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Long enough not to fire while the pointer is only crossing a row of icons,
// short enough that reaching for a hint doesn't feel like waiting for one.
// Radix's own default is 700ms, which is tuned for tooltips that decorate
// already-labelled controls rather than ones that carry the only words.
export const HINT_DELAY_MS = 300;

// A finger has no hover, so it asks for a hint the way Android does: by holding
// the control. How long the hold is, how far the finger may drift during it, and
// how long the hint stays once it lifts - long enough to read a few words.
const HOLD_MS = 500;
const HOLD_SLOP_PX = 10;
const HELD_HINT_MS = 1500;

// Radix opens a hint on focus with no delay, which is what a keyboard arrival
// wants and what a pointer-driven focus never does. Two controls take focus
// with nobody pointing at them: the multiselect drag handles focus
// themselves from their own `onPointerDown` (`hooks/useDragSort.ts`, because the
// `preventDefault` there suppresses the browser's own focus and the Up/Down keys
// need it), and a menu trigger is handed focus back when its menu closes.
// `:focus-visible` is the browser's answer to the same question and jsdom
// implements none of it, so the modality is tracked here: one flag for the page,
// because what somebody last reached for has one answer.
let pointerWasTheLastInput = false;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      pointerWasTheLastInput = true;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      pointerWasTheLastInput = false;
    },
    true,
  );
}

/**
 * Gives an icon-only control both its accessible name and a hover hint that
 * says the same thing.
 *
 * Wrap the button (or link, or menu trigger) and pass `label`; do not also set
 * `aria-label` on the child. One string feeding both is the point: an icon
 * button whose hint and whose announced name disagree is worse than one with no
 * hint at all, and two props at the call site is how they drift.
 */
function IconTooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipContent>["side"];
  align?: React.ComponentPropsWithoutRef<typeof TooltipContent>["align"];
}) {
  const [hovered, setHovered] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const hold = React.useRef<{
    id: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  const linger = React.useRef<number | undefined>(undefined);
  // A finger is on the control, held or not yet.
  const fingerDown = React.useRef(false);

  const endHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  // However the finger leaves - a lift, or a scroll the browser took over - a
  // hint it held stays a moment and goes. Radix's own dismissals reach only
  // `hovered`, since one of them is the finger's leave at the lift.
  const fingerGone = () => {
    fingerDown.current = false;
    endHold();
    window.clearTimeout(linger.current);
    linger.current = window.setTimeout(() => setHeld(false), HELD_HINT_MS);
  };
  React.useEffect(
    () => () => {
      endHold();
      window.clearTimeout(linger.current);
    },
    [],
  );

  return (
    // The provider lives here rather than once in the root layout so the
    // component is self-sufficient: Radix throws without one, and a shared
    // provider would mean every page, dialog and component test that renders an
    // icon button has to remember to supply it. What that costs is
    // `skipDelayDuration` grouping across separate hints - with a delay this
    // short, moving between two row actions re-waits 300ms instead of opening
    // instantly.
    //
    // `disableHoverableContent` because there is nothing in a hint to hover:
    // keeping it open while the pointer travels into it only leaves a chip
    // sitting over the next control.
    <TooltipProvider delayDuration={HINT_DELAY_MS} disableHoverableContent>
      <Tooltip open={hovered || held} onOpenChange={setHovered}>
        <TooltipTrigger
          asChild
          aria-label={label}
          // A hold shows the hint, and the click its release would send is
          // swallowed: the finger asked what the control is, not to use it. A
          // tap, a drag and a scroll are untouched.
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            fingerDown.current = true;
            window.clearTimeout(linger.current);
            setHeld(false);
            endHold();
            const pointerId = event.pointerId;
            hold.current = {
              id: pointerId,
              x: event.clientX,
              y: event.clientY,
              timer: window.setTimeout(() => {
                hold.current = null;
                setHeld(true);
                swallowClickOf({ pointerId });
              }, HOLD_MS),
            };
          }}
          onPointerMove={(event) => {
            const current = hold.current;
            if (
              current &&
              event.pointerId === current.id &&
              Math.hypot(event.clientX - current.x, event.clientY - current.y) >
                HOLD_SLOP_PX
            ) {
              endHold();
            }
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== "mouse") fingerGone();
          }}
          onPointerCancel={(event) => {
            if (event.pointerType !== "mouse") fingerGone();
          }}
          // Android answers a hold with a context menu of its own, over the hint.
          onContextMenu={(event) => {
            if (fingerDown.current || held) event.preventDefault();
          }}
          // Vetoing Radix's own focus handler is what works, and it has to be
          // this half: `Slot` runs the child's handler before Radix's, so
          // Radix's identical guard is still reading a false flag. Its
          // `composeEventHandlers` skips its own half when the first has called
          // `preventDefault`, and a focus event is not cancelable, so this
          // suppresses the open and nothing else. Refusing the open from
          // `onOpenChange` instead is what it looks like it should be, and is
          // wrong: Radix tells the provider a tooltip opened before it asks us,
          // so the veto leaves the delay window open and the next hover opens
          // instantly.
          onFocus={(event) => {
            if (pointerWasTheLastInput) event.preventDefault();
          }}
          // Radix points `aria-describedby` at the content whenever the tooltip
          // is open, which for a hint that repeats the name verbatim makes a
          // screen reader announce it twice. Passing the key explicitly as
          // undefined overrides that, since the trigger's own props are spread
          // last. The name is on the trigger; the chip is the sighted half of
          // the same fact.
          aria-describedby={undefined}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side={side} align={align}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  IconTooltip,
};
