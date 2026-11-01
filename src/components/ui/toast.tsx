"use client";

import * as Primitive from "./primitives/toast";
import type { AppComponentProps } from "./component-props";
import { cn } from "@/lib/utils";

export { ToastProvider, ToastContent, ToastPortal } from "./primitives/toast";

function ToastViewport({
  className,
  ...props
}: AppComponentProps<typeof Primitive.ToastViewport>) {
  return (
    <Primitive.ToastViewport
      className={cn(
        "top-4 bottom-auto z-[100] max-w-none sm:top-auto sm:bottom-4 sm:max-w-[388px]",
        className,
      )}
      {...props}
    />
  );
}

function Toast({
  className,
  ...props
}: AppComponentProps<typeof Primitive.Toast>) {
  return (
    <Primitive.Toast
      className={cn(
        "top-0 bottom-auto rounded-md sm:top-auto sm:bottom-0 data-limited:hidden",
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({
  className,
  ...props
}: AppComponentProps<typeof Primitive.ToastTitle>) {
  return (
    <Primitive.ToastTitle
      className={cn("font-semibold", className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: AppComponentProps<typeof Primitive.ToastDescription>) {
  return (
    <Primitive.ToastDescription
      className={cn("text-inherit opacity-90", className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  ...props
}: AppComponentProps<typeof Primitive.ToastClose>) {
  return (
    <Primitive.ToastClose
      className={cn(
        "text-current opacity-70 hover:bg-transparent hover:text-current hover:opacity-100 touch:min-h-11 touch:min-w-11",
        className,
      )}
      {...props}
    />
  );
}

export { Toast, ToastClose, ToastDescription, ToastTitle, ToastViewport };
