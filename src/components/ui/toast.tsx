"use client";

import * as React from "react";
import { Toast as ToastPrimitives } from "@base-ui/react/toast";
import type { PrimitiveProps } from "./slot";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  PrimitiveProps<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 touch:pr-12 shadow-lg transition-all translate-x-[var(--toast-swipe-movement-x,0px)] translate-y-[var(--toast-swipe-movement-y,0px)] data-[swiping]:transition-none data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[ending-style]:animate-out data-[ending-style]:fade-out-80 data-[ending-style]:slide-out-to-top-full sm:data-[ending-style]:slide-out-to-right-full data-[limited]:hidden",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive border-destructive-solid bg-destructive-solid text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  PrimitiveProps<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

// The destructive toast is a filled `--destructive-solid` surface, so both controls
// on it are drawn in `--destructive-foreground` at varying opacity rather than in a
// second colour. The action's hover was `bg-destructive` over that fill, which worked
// only while `--destructive` was eighteen points lighter than `--destructive-solid`;
// on the coral pair they are two points apart and the hover state disappeared. A
// white wash lifts it in both themes and does not depend on that gap.
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  PrimitiveProps<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 touch:min-h-11 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-destructive-foreground/40 group-[.destructive]:hover:border-destructive-foreground/60 group-[.destructive]:hover:bg-destructive-foreground/15 group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive-foreground",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

// Shown from the start on touch, where the hover that reveals it never comes. The
// toast's `touch:pr-12` keeps the action clear of its hit area.
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  PrimitiveProps<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 touch:opacity-100 touch:tap-target transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-destructive-foreground/80 group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive-foreground group-[.destructive]:focus:ring-offset-destructive-solid",
      className,
    )}
    aria-label="Dismiss notification"
    aria-hidden={false}
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  PrimitiveProps<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  PrimitiveProps<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = PrimitiveProps<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
