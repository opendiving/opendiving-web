"use client";
import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import type { AppComponentProps } from "./component-props";
import { cn } from "@/lib/utils";
export function DateFieldPopup({
  anchor,
  className,
  ...props
}: AppComponentProps<typeof Popover.Popup> & {
  anchor: React.RefObject<HTMLElement | null>;
}) {
  return (
    <Popover.Portal>
      <Popover.Positioner
        anchor={anchor}
        align="start"
        sideOffset={4}
        className="z-50"
      >
        <Popover.Popup
          className={cn(
            "w-auto rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none",
            className,
          )}
          render={(props, state) => (
            <div {...props} aria-hidden={!state.open || undefined} />
          )}
          {...props}
        />
      </Popover.Positioner>
    </Popover.Portal>
  );
}
