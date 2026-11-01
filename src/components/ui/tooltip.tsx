"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { childRender, type PrimitiveProps } from "./slot";

import { tooltipEscapeEvents } from "./popup-events";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip({ onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  return (
    <TooltipPrimitive.Root
      disableHoverablePopup
      {...props}
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key")
          tooltipEscapeEvents.add(details.event);
        onOpenChange?.(open, details);
      }}
    />
  );
}

const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  PrimitiveProps<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    type="button"
    ref={ref}
    {...props}
    render={asChild ? childRender(children) : undefined}
  >
    {asChild ? undefined : children}
  </TooltipPrimitive.Trigger>
));
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  PrimitiveProps<typeof TooltipPrimitive.Popup> &
    Pick<TooltipPrimitive.Positioner.Props, "side" | "align" | "sideOffset">
>(({ className, sideOffset = 6, side, align, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner
      side={side}
      align={align}
      sideOffset={sideOffset}
      className="z-50"
    >
      <TooltipPrimitive.Popup
        render={(props, state) => (
          <div {...props} aria-hidden={!state.open || undefined} />
        )}
        role="tooltip"
        ref={ref}
        className={cn(
          // Same surface as the charts' hover cards - `bg-tooltip` rather than
          // `bg-popover`, which is declared the same colour as `--card` and would
          // read as cut out of whatever panel the button sits in. See "`--tooltip`
          // is its own surface token" in DECISIONS.md.
          //
          // `max-w-64` with normal wrapping, because these carry a whole
          // accessible name: "Sign out Chrome on macOS" is a realistic one and a
          // `whitespace-nowrap` chip would run off the viewport on a phone.
          "z-50 max-w-64 rounded-md border border-white/10 bg-tooltip px-2 py-1 text-xs text-tooltip-foreground shadow-lg data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Popup.displayName;

// Avoid opening hints while the pointer is only crossing a row of icons.
export const HINT_DELAY_MS = 300;

// A finger has no hover, so it asks for a hint the way Android does: by holding
// the control. How long the hold is, how far the finger may drift during it, and
// how long the hint stays once it lifts - long enough to read a few words.
const HOLD_MS = 500;
const HOLD_SLOP_PX = 10;
const HELD_HINT_MS = 1500;

// Restored or programmatic focus after a pointer press must not open a hint.
// One modality flag covers all controls, including triggers in nested popups.
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
  const linger = React.useRef<number | undefined>(undefined);
  // A finger is on the control, held or not yet.
  const fingerDown = React.useRef(false);
  // The click a hold's release sends is not for the control.
  const swallowClick = React.useRef(false);
  // Stops following the finger that is down, if one is.
  const release = React.useRef<(() => void) | null>(null);

  // The finger is followed on `window` rather than on the control: a drag handle
  // under it moves its row, node and all, out from under the finger, and the
  // events go with the node. A move past the slop is a drag, which the hint
  // gives way to whether it showed yet or not; however the finger leaves - a
  // lift, or a scroll the browser took over - a hint it held stays a moment and
  // goes. The tooltip's dismissals reach only `hovered`, since one of them is the
  // finger's leave at the lift.
  const followFinger = (down: React.PointerEvent) => {
    release.current?.();
    const { pointerId, clientX, clientY } = down;
    const timer = window.setTimeout(() => {
      setHeld(true);
      swallowClick.current = true;
    }, HOLD_MS);
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (
        Math.hypot(event.clientX - clientX, event.clientY - clientY) <=
        HOLD_SLOP_PX
      ) {
        return;
      }
      window.clearTimeout(timer);
      setHeld(false);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      release.current?.();
      linger.current = window.setTimeout(() => setHeld(false), HELD_HINT_MS);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    fingerDown.current = true;
    release.current = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      fingerDown.current = false;
      release.current = null;
    };
  };
  React.useEffect(
    () => () => {
      release.current?.();
      window.clearTimeout(linger.current);
    },
    [],
  );

  return (
    // A provider per hint also keeps icon buttons self-contained in dialogs and tests.
    <TooltipProvider delay={HINT_DELAY_MS}>
      <Tooltip
        open={hovered || held}
        onOpenChange={setHovered}
        disableHoverablePopup
      >
        <TooltipTrigger
          asChild
          aria-label={label}
          // A hold shows the hint, and the click its release would send is
          // swallowed: the finger asked what the control is, not to use it. A
          // tap, a drag and a scroll are untouched.
          onPointerDown={(event) => {
            swallowClick.current = false;
            if (event.pointerType === "mouse") return;
            window.clearTimeout(linger.current);
            setHeld(false);
            followFinger(event);
          }}
          // Stopped before the control's own handlers hear it. A popover open
          // elsewhere reads a stopped click as taken and stays open, which suits a
          // hold: it asks what the control is and dismisses nothing.
          onClickCapture={(event) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={() => {
            swallowClick.current = false;
          }}
          // Android answers a hold with a context menu of its own, over the hint.
          onContextMenu={(event) => {
            if (fingerDown.current || held) event.preventDefault();
          }}
          // Skip Base UI focus handling when a pointer, rather than Tab, moved focus.
          onFocus={(event) => {
            if (pointerWasTheLastInput) event.preventBaseUIHandler();
          }}
          // The accessible name already contains the hint.
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

/**
 * Text that stands for more than it shows - "Dahab, Egypt +2" - with all of it
 * in `hint`, or no `hint` when the text already says everything.
 *
 * A mouse reads it off `title`. A finger has no hover, so a tap shows the same
 * words as a hint, until a press elsewhere. A tap on a link - one inside the
 * text, or one the text sits in - is the link's: on a card a tap means the
 * record, and its page carries the same text with the hint.
 */
function TextHint({
  hint,
  children,
}: {
  hint: string | undefined;
  children: React.ReactElement;
}) {
  const [tapped, setTapped] = React.useState(false);
  const finger = React.useRef(false);
  if (!hint) return children;

  return (
    <TooltipProvider>
      {/* Opened by a tap and nothing else: a mouse already has the `title`, and
          The tooltip's own opens - a hover, a focus - would show it twice. */}
      <Tooltip
        open={tapped}
        onOpenChange={(open) => {
          if (!open) setTapped(false);
        }}
      >
        <TooltipTrigger
          asChild
          title={hint}
          onPointerDown={(event) => {
            finger.current = event.pointerType !== "mouse";
          }}
          onClick={(event) => {
            if (!finger.current) return;
            if ((event.target as Element).closest("a")) return;
            setTapped(true);
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
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
  TextHint,
};
