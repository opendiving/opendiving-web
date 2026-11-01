"use client";
import * as React from "react";
import * as Primitive from "./primitives/dialog";
import type { AppComponentProps } from "./component-props";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTooltip, tooltipEscapeEvents } from "./tooltip";
import { setRef } from "./refs";
import { useStuckAtEdge } from "@/hooks/useStuckAtEdge";
import {
  scrollContainerOf,
  useFocusTappedFieldInPlace,
  useKeepFocusedFieldVisible,
  useVisualViewport,
} from "@/hooks/useVisualViewport";
export {
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
} from "./primitives/dialog";
function Dialog({
  onOpenChange,
  dismissOnOutsidePress = false,
  ...props
}: React.ComponentProps<typeof Primitive.Dialog> & {
  dismissOnOutsidePress?: boolean;
}) {
  return (
    <Primitive.Dialog
      {...props}
      onOpenChange={(open, details) => {
        if (details.reason === "outside-press" && !dismissOnOutsidePress)
          details.cancel();
        if (
          details.reason === "escape-key" &&
          (tooltipEscapeEvents.has(details.event) ||
            document.querySelector('[role="tooltip"][data-open]'))
        )
          details.cancel();
        if (!details.isCanceled) onOpenChange?.(open, details);
      }}
    />
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

function DialogContent({
  className,
  children,
  ref,
  initialFocus,
  finalFocus,
  ...props
}: AppComponentProps<typeof Primitive.DialogContent>) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  return (
    <Primitive.DialogContent
      showCloseButton={false}
      ref={(node) => {
        panelRef.current = node;
        setRef(ref, node);
      }}
      className={cn(
        "top-[calc(var(--visual-viewport-top)_+_var(--visual-viewport-height)/2)] max-h-[calc(var(--visual-viewport-height)_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg sm:max-w-lg overflow-y-auto rounded-lg border bg-background p-6 px-(--card-pad) text-base text-foreground shadow-lg ring-0 duration-200",
        className,
      )}
      initialFocus={
        initialFocus ??
        (() => {
          const panel = panelRef.current;
          if (!panel || panel.contains(document.activeElement)) return false;
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
        })
      }
      finalFocus={
        finalFocus ??
        (() => (openerRef.current?.isConnected ? openerRef.current : true))
      }
      {...props}
    >
      <RememberOpener openerRef={openerRef} />
      <VisualViewportEffects />
      <InsideDialogContext.Provider value={true}>
        {children}
      </InsideDialogContext.Provider>
    </Primitive.DialogContent>
  );
}

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
        <Primitive.DialogClose
          data-dialog-close=""
          className="absolute right-4 top-4 rounded-sm opacity-70 touch:tap-target ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[open]:bg-accent data-[open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Primitive.DialogClose>
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
  React.ElementRef<typeof Primitive.DialogTitle>,
  AppComponentProps<typeof Primitive.DialogTitle>
>(({ className, ...props }, ref) => (
  <Primitive.DialogTitle
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof Primitive.DialogDescription>,
  AppComponentProps<typeof Primitive.DialogDescription>
>(({ className, ...props }, ref) => (
  <Primitive.DialogDescription
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  useInsideDialog,
};
