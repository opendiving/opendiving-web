"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTooltip } from "@/components/ui/tooltip";
import { useVisualViewport } from "@/hooks/useVisualViewport";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * The frame the dialog is centred in: a box covering exactly the part of the
 * page the browser is showing, rather than the layout viewport.
 *
 * **Its own component so that `useVisualViewport` runs only while a dialog is
 * open.** `DialogContent` is rendered by every page that *declares* a dialog,
 * open or not - `DialogPortal` is what gates the DOM, and it renders `null`
 * while closed, but the component around it still runs its hooks. A listener in
 * `DialogContent`'s body meant a dozen of them on the dive form before the
 * diver had touched anything. This sits inside the portal, so it mounts with
 * the dialog and unmounts with it.
 */
function DialogFrame({ children }: { children: React.ReactNode }) {
  useVisualViewport();

  return (
    // The translate-centred version this replaces is what a phone breaks. Its
    // `max-h-[90vh]` was taller than an iOS screen with Safari's toolbars up,
    // and its anchor was the layout viewport - which the on-screen keyboard
    // displaces without resizing - so a form dialog lost its title off the top
    // and its buttons behind the keys. Centring inside a box of exactly the
    // visible size means the dialog cannot be laid out anywhere the diver
    // cannot see.
    //
    // `pointer-events-none` so the gutter around the dialog still belongs to
    // the overlay, which is what closes it on an outside click; the dialog
    // itself takes them back. `p-4` is that gutter: the content used to be
    // `w-full`, edge to edge on a phone with its close button in the corner of
    // the screen.
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex items-center justify-center p-4"
      style={{
        top: "var(--visual-viewport-top)",
        height: "var(--visual-viewport-height)",
      }}
    >
      {children}
    </div>
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogFrame>
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // `max-h`/`overflow-y` live here rather than on individual dialogs:
          // content taller than the viewport would otherwise be clipped with no
          // way to reach it, since the frame is fixed-positioned and Radix locks
          // scrolling on the page behind it. `max-h-full` is the frame's height
          // less its padding, so the gutter survives a dialog that wants every
          // pixel.
          "pointer-events-auto relative grid max-h-full w-full max-w-lg gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {/* `IconTooltip` supplies the `aria-label` the `sr-only` span used to,
            so the cross keeps its name and gains the hover hint every other icon
            button in the app has. */}
        <IconTooltip label="Close">
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </IconTooltip>
      </DialogPrimitive.Content>
    </DialogFrame>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // One row at every width, not `flex-col-reverse` below `sm:`. Every
      // dialog here ends in Cancel plus one action, and the pair fits a 320px
      // viewport with room over - stacking them was spending two rows on
      // something that never needed them. `gap-2` rather than `space-x-2` so
      // the spacing survives the wrap: `space-x` only separates siblings on a
      // line, so a footer that did wrap - a longer action label, a bigger font
      // - lost the gap entirely, which is what left the buttons touching.
      // `flex-wrap-reverse` puts the action on top if it ever comes to that,
      // the same way the old mobile column did.
      "flex flex-wrap-reverse items-center justify-end gap-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
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
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
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
};
