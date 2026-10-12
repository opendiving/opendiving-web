"use client";

import type { ReactNode, RefCallback, RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LineChart } from "lucide-react";

interface DiveProfileFullscreenProps {
  open: boolean;
  onClose: () => void;
  // The button that opened it, which takes focus back on the way out: Radix
  // hands it to a `DialogTrigger`, and this has none.
  returnFocusRef: RefObject<HTMLElement | null>;
  // The channel menu and the button out, on the title row.
  controls: ReactNode;
  readout: ReactNode;
  // On the box the plot fills, which the chart measures to size its viewBox.
  plotRef: RefCallback<HTMLElement>;
  children: ReactNode;
}

// The profile filling the screen, with the readout beside the plot instead of
// over it: above on a screen held upright, to the left on one turned sideways,
// so a finger scrubbing the plot never covers the numbers it is reading.
//
// A Radix dialog for what a modal owes - Escape, a focus trap, the page behind
// locked and hidden from a screen reader - but not `ui/dialog`'s
// `DialogContent`, whose centred, padded card for a form is everything this is
// not.
export function DiveProfileFullscreen({
  open,
  onClose,
  returnFocusRef,
  controls,
  readout,
  plotRef,
  children,
}: DiveProfileFullscreenProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Covered by the content, and there for what Radix hangs off it: the
            lock on the page's scroll. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // The panel rather than its first button, whose hint would open over
          // the title on arrival.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus({ preventScroll: true });
          }}
          className="fixed inset-0 z-50 flex gap-4 bg-background p-4 text-foreground outline-none portrait:flex-col landscape:flex-row"
        >
          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
                <LineChart className="h-5 w-5" aria-hidden="true" />
                Dive Profile
              </DialogPrimitive.Title>
              {controls}
            </div>
            {readout}
          </div>
          <div ref={plotRef} className="relative min-h-0 min-w-0 flex-1">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
