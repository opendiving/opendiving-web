"use client";

import * as React from "react";
import { useRender } from "@base-ui/react/use-render";

export function childRender(children: React.ReactNode) {
  if (!React.isValidElement(children)) {
    throw new Error("asChild requires one React element");
  }
  return children;
}

export const Slot = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ children, ...props }, ref) =>
  useRender({
    render: childRender(children),
    ref,
    props,
  }),
);
Slot.displayName = "Slot";

export type PrimitiveProps<T extends React.ElementType> = Omit<
  React.ComponentPropsWithoutRef<T>,
  "className"
> & { className?: string };
