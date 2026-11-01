"use client";

import * as React from "react";
import * as AvatarPrimitive from "./primitives/avatar";
import type { AppComponentProps } from "./component-props";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Avatar>,
  AppComponentProps<typeof AvatarPrimitive.Avatar>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Avatar
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.AvatarImage>,
  AppComponentProps<typeof AvatarPrimitive.AvatarImage>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.AvatarImage
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.AvatarFallback>,
  AppComponentProps<typeof AvatarPrimitive.AvatarFallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.AvatarFallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
