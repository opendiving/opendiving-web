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
 * Mirrors `window.visualViewport` onto the CSS variables `DialogContent`
 * positions itself with, for as long as a dialog is open. Renders nothing.
 *
 * **A child of the content rather than a hook in `DialogContent`'s body**,
 * because `DialogContent` is rendered by every page that *declares* a dialog,
 * open or not: `DialogPortal` is what gates the DOM, and it renders `null`
 * while closed, but the component around it still runs its hooks. A listener in
 * that body meant a dozen of them on the dive form before the diver had touched
 * anything. Children of the content mount and unmount with the portal.
 */
function VisualViewportVars() {
  useVisualViewport();
  return null;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* **Nothing may come between `DialogPortal` and this.** The portal wraps
        each of its own children in a `Presence`, which reads the exit animation
        off the node its ref lands on - and a wrapper component that is not a
        `forwardRef` swallows that ref silently, leaving `getAnimationName(null)`
        to answer `"none"` and unmount the whole subtree in the same commit. A
        positioning `<div>` here cost every dialog in the app its exit
        animation, with nothing on screen to say so but a box that vanished
        while the overlay behind it went on fading. See DECISIONS.md.

        Which is why the visible viewport reaches this as *variables* rather
        than as a parent box. `useVisualViewport` keeps them on what the browser
        is really showing, and the three `calc`s below are the whole geometry:
        centred on the visible area and never taller than it, less a 1rem
        gutter. `100vh` is what this replaces, and it is wrong on exactly the
        device that reported the bug - iOS measures it against the viewport
        Safari would have with its toolbars retracted, and displaces the layout
        viewport without resizing it when the keyboard opens. */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // `max-h`/`overflow-y` live here rather than on individual dialogs:
        // content taller than the viewport would otherwise be clipped with no
        // way to reach it, since the dialog is fixed-positioned and Radix locks
        // scrolling on the page behind it.
        //
        // `w-[calc(100%-2rem)]` rather than `w-full`, and `rounded-lg` rather
        // than `sm:rounded-lg`: the dialog used to run edge to edge on a phone,
        // with its close button in the corner of the screen.
        "fixed left-[50%] top-[calc(var(--visual-viewport-top)_+_var(--visual-viewport-height)/2)] z-50 grid max-h-[calc(var(--visual-viewport-height)_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className,
      )}
      {...props}
    >
      <VisualViewportVars />
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
