"use client";
import * as React from "react";
import * as Primitive from "./primitives/dropdown-menu";
import type { AppComponentProps } from "./component-props";
import { cn } from "@/lib/utils";
export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./primitives/dropdown-menu";
const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Primitive.DropdownMenuTrigger>
>(({ onPointerDown, onPointerCancel, onClick, children, ...props }, ref) => {
  const pressedHere = React.useRef(false);
  return (
    <Primitive.DropdownMenuTrigger
      ref={ref}
      type="button"
      {...props}
      onPointerDown={(event) => {
        pressedHere.current = true;
        onPointerDown?.(event);
      }}
      onPointerCancel={(event) => {
        pressedHere.current = false;
        onPointerCancel?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        // A modal's outside press can dismiss it before its click reaches the trigger.
        if (event.detail > 0 && !pressedHere.current)
          event.preventBaseUIHandler();
        pressedHere.current = false;
      }}
    >
      {children}
    </Primitive.DropdownMenuTrigger>
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

function DropdownMenuContent({
  className,
  ...props
}: AppComponentProps<typeof Primitive.DropdownMenuContent>) {
  return (
    <Primitive.DropdownMenuContent
      className={cn(
        "w-auto rounded-md border overscroll-contain ring-0",
        className,
      )}
      render={(props, state) => (
        <div {...props} aria-hidden={!state.open || undefined} />
      )}
      {...props}
    />
  );
}
function DropdownMenuItem({
  className,
  ...props
}: AppComponentProps<typeof Primitive.DropdownMenuItem>) {
  return (
    <Primitive.DropdownMenuItem
      className={cn(
        "rounded-sm px-2 py-1.5 touch:py-3 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
export { DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
