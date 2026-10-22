"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useInsideDialog } from "@/components/ui/dialog";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  useFocusTappedFieldInPlace,
  useVisualViewport,
} from "@/hooks/useVisualViewport";
import { cn } from "@/lib/utils";

// Where a finger drives a picker, its open menu takes the visible screen - input
// at the top, rows down to the keyboard - rather than dropping down from wherever
// the field sits into the half the keyboard leaves. Scrolling the page to make
// room fails in Safari 26: the layout viewport stays where it was when the field
// took focus, stranding the sticky header off screen, and a focus delayed until
// the scroll has landed opens no keyboard. Inside a dialog the menu stays a
// dropdown, the dialog being fitted above the keyboard already.

/**
 * Whether `input`'s picker shows as a full-screen sheet - on touch, outside a
 * dialog, while `open`. A tap on the input is focused in place, so Safari does
 * not pan to a field the sheet is about to move to the top anyway.
 */
export function usePickerSheet(
  input: RefObject<HTMLInputElement | null>,
  open: boolean,
): boolean {
  const coarsePointer = useCoarsePointer();
  const insideDialog = useInsideDialog();
  const enabled = coarsePointer && !insideDialog;
  useFocusTappedFieldInPlace({ within: input, takeOver: () => enabled });
  return enabled && open;
}

/** The menu's box: a dropdown under the field, or the rest of the sheet. */
export function pickerMenuClassName(sheet: boolean) {
  return cn(
    "overflow-auto overscroll-contain rounded-md border bg-popover text-popover-foreground",
    sheet ? "min-h-0" : "absolute z-50 mt-1 max-h-60 w-full shadow-md",
  );
}

interface PickerSheetProps {
  sheet: boolean;
  // The input and whatever sits over it - the clear button, the spinner.
  field: ReactNode;
  // The listbox, or nothing while the menu is shut.
  menu: ReactNode;
  // Leaves the field, which is what closes the sheet.
  onDone: () => void;
}

// The same elements in either mode, only restyled, so that the input is never
// remounted and keeps focus - and the keyboard - as the sheet opens around it.
export function PickerSheet({ sheet, field, menu, onDone }: PickerSheetProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  // iOS scrolls the document under a drag on a fixed box, `overflow: hidden` on
  // the root or not, and the sheet would chase it. Only a list with somewhere to
  // go may move; its `overscroll-contain` keeps the drag from passing on.
  useEffect(() => {
    const layer = layerRef.current;
    if (!sheet || !layer) return;
    const onTouchMove = (event: TouchEvent) => {
      const list =
        event.target instanceof Element
          ? event.target.closest('[role="listbox"]')
          : null;
      if (list && list.scrollHeight > list.clientHeight) return;
      event.preventDefault();
    };
    layer.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => layer.removeEventListener("touchmove", onTouchMove);
  }, [sheet]);

  return (
    // Holds the field's place in the form while the field is up in the sheet.
    <div className="relative touch:min-h-11">
      <div
        ref={layerRef}
        className={cn(
          sheet &&
            "fixed inset-x-0 top-(--visual-viewport-top) z-51 flex h-(--visual-viewport-height) flex-col gap-2 bg-background p-3",
        )}
      >
        <div className={cn(sheet && "flex items-center gap-2")}>
          <div className={cn("relative", sheet && "min-w-0 flex-1")}>
            {field}
          </div>
          {sheet && (
            <Button
              type="button"
              variant="ghost"
              // Keeps the input focused until the click, so leaving it is the
              // click's doing and runs the same blur as any other way out.
              onMouseDown={(e) => e.preventDefault()}
              onClick={onDone}
            >
              Done
            </Button>
          )}
        </div>
        {menu}
      </div>
      {sheet && <PickerSheetEffects />}
    </div>
  );
}

// Mounted with the sheet: the viewport variables it is placed with, and a
// backdrop for the strip between the visible area and the keyboard, which iOS
// paints page content into and no fixed box can reach. Absolute in the document
// for that reason, as `DialogOverlay` is, and under the sheet.
function PickerSheetEffects() {
  useVisualViewport();
  return createPortal(
    <div
      aria-hidden="true"
      className="absolute left-0 top-(--visual-viewport-doc-top) z-50 h-[calc(var(--visual-viewport-height)_+_100vh)] w-screen touch-none bg-background"
    />,
    document.body,
  );
}
