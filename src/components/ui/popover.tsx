"use client";
import * as React from "react";
import * as Primitive from "./primitives/popover";
import { cn } from "@/lib/utils";
import type { AppComponentProps } from "./component-props";
export { Popover, PopoverTrigger } from "./primitives/popover";
function PopoverContent({
  className,
  ...props
}: AppComponentProps<typeof Primitive.PopoverContent>) {
  return (
    <Primitive.PopoverContent
      className={cn(
        "block gap-0 rounded-md border p-4 text-base shadow-md ring-0",
        className,
      )}
      render={(props, state) => (
        <div {...props} aria-hidden={!state.open || undefined} />
      )}
      {...props}
    />
  );
}
export { PopoverContent };
