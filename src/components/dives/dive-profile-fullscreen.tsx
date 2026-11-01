"use client";

import {
  useRef,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from "react";
import { Dialog } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { LineChart } from "lucide-react";

interface DiveProfileFullscreenProps {
  open: boolean;
  onClose: () => void;
  // The button that opened it takes focus back when it closes.
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
// A Base UI dialog for what a modal owes - Escape, a focus trap, the page behind
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
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* The backdrop covers the page while the modal locks its scroll. */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background" />
        <DialogPrimitive.Popup
          aria-describedby={undefined}
          // The panel rather than its first button, whose hint would open over
          // the title on arrival.
          ref={panelRef}
          initialFocus={panelRef}
          finalFocus={returnFocusRef}
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
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
