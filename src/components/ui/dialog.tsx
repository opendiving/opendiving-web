"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { childRender, type PrimitiveProps } from "./slot";
import {
  allowDismiss,
  focusAllowed,
  setRef,
  usePopupEvents,
  type PopupEvents,
} from "./popup-events";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTooltip } from "@/components/ui/tooltip";
import { useStuckAtEdge } from "@/hooks/useStuckAtEdge";
import {
  scrollContainerOf,
  useFocusTappedFieldInPlace,
  useKeepFocusedFieldVisible,
  useVisualViewport,
} from "@/hooks/useVisualViewport";

const DialogEventsContext =
  React.createContext<React.RefObject<PopupEvents> | null>(null);
function Dialog({
  onOpenChange,
  ...props
}: Omit<DialogPrimitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void;
}) {
  const events = usePopupEvents();
  return (
    <DialogEventsContext.Provider value={events}>
      <DialogPrimitive.Root
        {...props}
        onOpenChange={(open, details) => {
          allowDismiss(details, events.current, true);
          if (!details.isCanceled) onOpenChange?.(open);
        }}
      />
    </DialogEventsContext.Provider>
  );
}

const InsideDialogContext = React.createContext(false);

/**
 * Whether the caller renders inside `DialogContent`, a box already fitted to
 * the part of the screen the keyboard leaves - see `usePickerSheet`, which
 * leaves a dropdown there as it is.
 */
function useInsideDialog() {
  return React.useContext(InsideDialogContext);
}
const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  PrimitiveProps<typeof DialogPrimitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => (
  <DialogPrimitive.Trigger
    type="button"
    ref={ref}
    {...props}
    render={asChild ? childRender(children) : undefined}
  >
    {asChild ? undefined : children}
  </DialogPrimitive.Trigger>
));
DialogTrigger.displayName = "DialogTrigger";
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = React.forwardRef<
  HTMLButtonElement,
  PrimitiveProps<typeof DialogPrimitive.Close> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => (
  <DialogPrimitive.Close
    type="button"
    ref={ref}
    {...props}
    render={asChild ? childRender(children) : undefined}
  >
    {asChild ? undefined : children}
  </DialogPrimitive.Close>
));

DialogClose.displayName = "DialogClose";

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  PrimitiveProps<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    data-dialog-overlay=""
    ref={ref}
    className={cn(
      // **Absolutely positioned, not fixed, and that is the whole of this.**
      //
      // iOS clips a `position: fixed` box to the layout viewport. With the
      // keyboard up it also keeps a band between that viewport's bottom edge and
      // the top of the keyboard, and goes on painting page content into it - so
      // the page shows through under an open modal in a strip no fixed element
      // can reach.
      //
      // Neither `fixed` alternative works, so neither is worth retrying.
      // `inset-0` is sized to a window the diver is no longer looking at. Sizing
      // to `--visual-viewport-height` tracks what they *can* see and still fails,
      // and not from bad arithmetic: a hit test at the very bottom of the
      // viewport returns the scrim, so it covers everything it is allowed to,
      // and the strip is simply outside. No `fixed` geometry fixes this, however
      // generous its slack.
      //
      // `body` is `position: relative` while a dialog is open, so this resolves
      // against the document. `--visual-viewport-doc-top` is the visible top in
      // those coordinates; the height is what the browser reports plus a screen
      // of slack, the band's size being something the page is never told.
      // Overflowing costs nothing - the page behind is scroll-locked while this
      // is open, so none of it can be scrolled to, and the element unmounts with
      // the dialog.
      //
      // **`w-screen` rather than `inset-x-0`, and that is not cosmetic.** The
      // same scroll lock that positions `body` also puts a `margin-right` on it
      // equal to the scrollbar it just removed, so that the page does not jump
      // sideways. An absolute box takes `body`'s padding box as its containing
      // block, so `right: 0` would stop short by exactly that margin and leave an
      // undimmed strip down the right edge - the bug this whole section is about,
      // rotated 90 degrees. It is invisible on macOS, where overlay scrollbars
      // make the gap 0, and plain on Windows, Linux, or a Mac set to show
      // scrollbars always. `100vw` is the window regardless of what `body` is
      // doing, and cannot overflow into a scrollbar that is hidden anyway.
      "absolute left-0 top-[var(--visual-viewport-doc-top)] z-50 h-[calc(var(--visual-viewport-height)_+_100vh)] w-screen bg-black/80 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Backdrop.displayName;

/**
 * What a dialog owes the visible viewport, for as long as it is open: the CSS
 * variables `DialogOverlay` and `DialogContent` are positioned with, a tapped
 * field focused without Safari panning the dialog off the screen, and the
 * focused field kept inside the box those variables have just resized. Renders
 * nothing.
 *
 * **A child of the content rather than a hook in `DialogContent`'s body**,
 * because `DialogContent` is rendered by every page that *declares* a dialog,
 * open or not: `DialogPortal` is what gates the DOM, and it renders `null`
 * while closed, but the component around it still runs its hooks. A listener in
 * that body meant a dozen of them on the dive form before the diver had touched
 * anything. Children of the content mount and unmount with the portal.
 */
function VisualViewportEffects() {
  useVisualViewport();
  useFocusTappedFieldInPlace();
  useKeepFocusedFieldVisible();
  return null;
}

/**
 * The element a closing dialog should hand focus back to: whatever held it as
 * the dialog opened, unless that was an item in a menu. A dialog chosen from a
 * menu mounts while the item still has focus, and the menu closes straight
 * after and takes the item with it - so the answer is the button that opened
 * the menu, found through the `aria-controls` it carries while the menu is
 * open. Looped for a submenu, whose opener is itself a menu item.
 */
function returnFocusTarget(element: Element | null): HTMLElement | null {
  let target = element;
  for (
    let menu = target?.closest('[role="menu"]');
    menu?.id;
    menu = target?.closest('[role="menu"]')
  ) {
    const menuId = menu.id;
    target =
      Array.from(document.querySelectorAll("[aria-controls]")).find(
        (node) => node.getAttribute("aria-controls") === menuId,
      ) ?? null;
  }
  return target instanceof HTMLElement && target !== document.body
    ? target
    : null;
}

// Records the opener before a child can take autofocus.
function RememberOpener({
  openerRef,
}: {
  openerRef: React.RefObject<HTMLElement | null>;
}) {
  const [opener] = React.useState(() =>
    returnFocusTarget(document.activeElement),
  );
  React.useLayoutEffect(() => {
    openerRef.current = opener;
  }, [openerRef, opener]);
  return null;
}

// Skip the close control when choosing the first field to focus.
function openFocusCandidates(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>("*")).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.hidden &&
      !(el as HTMLButtonElement).disabled &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !(el instanceof HTMLAnchorElement) &&
      !el.hasAttribute("data-dialog-close"),
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  PrimitiveProps<typeof DialogPrimitive.Popup> &
    PopupEvents & {
      onOpenAutoFocus?: (event: Event) => void;
      onCloseAutoFocus?: (event: Event) => void;
    }
>(
  (
    {
      className,
      children,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onPointerDownOutside,
      onInteractOutside,
      onEscapeKeyDown,
      ...props
    },
    ref,
  ) => {
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const eventsRef = React.useContext(DialogEventsContext);
    React.useLayoutEffect(() => {
      if (eventsRef)
        eventsRef.current = {
          onPointerDownOutside,
          onInteractOutside,
          onEscapeKeyDown,
        };
    });
    const openerRef = React.useRef<HTMLElement | null>(null);
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          ref={(node) => {
            panelRef.current = node;
            setRef(ref, node);
          }}
          className={cn(
            // `max-h`/`overflow-y` live here rather than on individual dialogs:
            // content taller than the viewport would otherwise be clipped with no
            // way to reach it, since the dialog is fixed-positioned and the modal locks
            // scrolling on the page behind it.
            //
            // `w-[calc(100%-2rem)]` rather than `w-full`, and `rounded-lg` rather
            // than `sm:rounded-lg`, so the dialog does not run edge to edge on a
            // phone with its close button in the corner of the screen.
            //
            // `px-(--card-pad)` is `Card`'s own side padding, so a form reads the
            // same width in a dialog as in the card it also appears in.
            "fixed left-[50%] top-[calc(var(--visual-viewport-top)_+_var(--visual-viewport-height)/2)] z-50 grid max-h-[calc(var(--visual-viewport-height)_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 px-(--card-pad) shadow-lg duration-200 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95 data-[ending-style]:slide-out-to-left-1/2 data-[ending-style]:slide-out-to-top-[48%] data-[open]:slide-in-from-left-1/2 data-[open]:slide-in-from-top-[48%]",
            className,
          )}
          initialFocus={() => {
            const panel = panelRef.current;
            if (!panel || !focusAllowed(panel, onOpenAutoFocus)) return false;
            if (panel.contains(document.activeElement)) return false;
            const candidates = openFocusCandidates(panel);
            if (!(candidates[0] instanceof HTMLSelectElement)) {
              for (const candidate of candidates) {
                candidate.focus({ preventScroll: true });
                if (document.activeElement !== candidate) continue;
                if (candidate instanceof HTMLInputElement) candidate.select();
                return false;
              }
            }
            return panel;
          }}
          finalFocus={() => {
            if (!focusAllowed(panelRef.current, onCloseAutoFocus)) return false;
            return openerRef.current?.isConnected ? openerRef.current : true;
          }}
          {...props}
        >
          <RememberOpener openerRef={openerRef} />
          <VisualViewportEffects />
          <InsideDialogContext.Provider value={true}>
            {children}
          </InsideDialogContext.Provider>
        </DialogPrimitive.Popup>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Popup.displayName;

/**
 * Mirrors a row's height onto the dialog it scrolls in as `name`, for
 * `globals.css` to reserve as scroll padding while the row is pinned - measured
 * because a phone-width row can wrap.
 */
function useHeightOnScrollBox(
  ref: React.RefObject<HTMLElement | null>,
  name: string,
) {
  React.useEffect(() => {
    const row = ref.current;
    const box = row && scrollContainerOf(row);
    if (!row || !box) return;
    const observer = new ResizeObserver(() =>
      box.style.setProperty(name, `${row.offsetHeight}px`),
    );
    observer.observe(row);
    return () => {
      observer.disconnect();
      box.style.removeProperty(name);
    };
  }, [ref, name]);
}

/**
 * The dialog's title row, and the cross that closes it. `globals.css` sticks it
 * to the top of the dialog while there is room, and gives it a surface only
 * while it is stuck there - `DialogFooter`'s counterpart.
 */
const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const ref = React.useRef<HTMLDivElement>(null);
  // The root grows a pixel at the top, one short of the two the header is
  // stuck past.
  const stuck = useStuckAtEdge(ref, {
    edge: "top",
    rootMargin: "1px 0px 0px 0px",
    inScrollBox: true,
  });
  useHeightOnScrollBox(ref, "--dialog-header-height");
  return (
    <div
      ref={ref}
      data-dialog-header=""
      data-stuck={stuck ? "" : undefined}
      className={cn(
        // `gap-1.5` rather than `space-y-1.5`, which would give the last line
        // of text a margin for the cross after it.
        "flex flex-col gap-1.5 text-center sm:text-left",
        // Bled into the content's side and top padding, so that pinned it meets
        // the dialog's rounded edge, and at rest it sits where it did - and the
        // cross with it, placed against this box rather than the dialog's.
        "z-10 -mx-(--card-pad) -mt-6 px-(--card-pad) pt-6",
        className,
      )}
      {...props}
    >
      {children}
      {/* After the title in the reading order, and still first in the tab
        order - `DialogContent` steps over it when it places focus on open.
        `IconTooltip` supplies its `aria-label` and the hover hint every other
        icon button in the app has. */}
      <IconTooltip label="Close">
        <DialogPrimitive.Close
          data-dialog-close=""
          className="absolute right-4 top-4 rounded-sm opacity-70 touch:tap-target ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[open]:bg-accent data-[open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </IconTooltip>
    </div>
  );
};
DialogHeader.displayName = "DialogHeader";

/**
 * The dialog's Cancel and action row, last in its form so tab order and Enter to
 * submit are the form's own. `globals.css` sticks it to the foot of the dialog
 * while there is room, and gives it a surface only while it is stuck there.
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const ref = React.useRef<HTMLDivElement>(null);
  // The root grows a pixel at the foot, one short of the two the footer is
  // stuck past.
  const stuck = useStuckAtEdge(ref, {
    edge: "bottom",
    rootMargin: "0px 0px 1px 0px",
    inScrollBox: true,
  });
  useHeightOnScrollBox(ref, "--dialog-footer-height");
  return (
    <div
      ref={ref}
      data-dialog-footer=""
      data-stuck={stuck ? "" : undefined}
      className={cn(
        // One row whenever the buttons fit, not `flex-col-reverse` below `sm:`:
        // most dialogs here end in Cancel plus one action, which fits a phone
        // row, and stacking spent two rows on it. `gap-2` rather than `space-x-2`
        // so the spacing survives a wrap - `space-x` only separates siblings on
        // a line. A footer does wrap at 320px when it holds three buttons or a
        // long action label, and `flex-wrap-reverse` then puts the action on top,
        // the way the old mobile column did.
        "flex flex-wrap-reverse items-center justify-end gap-2",
        // Bled into the content's side and bottom padding, so that pinned it
        // meets the dialog's rounded edge, and at rest it sits where it did.
        "z-10 -mx-(--card-pad) -mb-6 px-(--card-pad) pb-6",
        className,
      )}
      {...props}
    />
  );
};
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  PrimitiveProps<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  PrimitiveProps<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  useInsideDialog,
};
