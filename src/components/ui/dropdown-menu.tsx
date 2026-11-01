"use client";

import * as React from "react";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { childRender, type PrimitiveProps } from "./slot";
import { focusAllowed, setRef } from "./popup-events";

function DropdownMenu({
  onOpenChange,
  ...props
}: Omit<DropdownMenuPrimitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenuPrimitive.Root
      {...props}
      onOpenChange={(open) => onOpenChange?.(open)}
    />
  );
}
const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  PrimitiveProps<typeof DropdownMenuPrimitive.Trigger> & { asChild?: boolean }
>(
  (
    { asChild, children, onPointerDown, onPointerCancel, onClick, ...props },
    ref,
  ) => {
    const pressedHere = React.useRef(false);
    return (
      <DropdownMenuPrimitive.Trigger
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
        render={asChild ? childRender(children) : undefined}
      >
        {asChild ? undefined : children}
      </DropdownMenuPrimitive.Trigger>
    );
  },
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.SubmenuRoot;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubmenuTrigger>,
  PrimitiveProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubmenuTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 touch:py-3 text-sm outline-none data-[highlighted]:bg-accent data-[popup-open]:bg-accent",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubmenuTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubmenuTrigger.displayName;

type ContentProps = PrimitiveProps<typeof DropdownMenuPrimitive.Popup> &
  Pick<
    DropdownMenuPrimitive.Positioner.Props,
    "align" | "side" | "sideOffset" | "alignOffset"
  > & {
    onCloseAutoFocus?: (event: Event) => void;
  };
const DropdownMenuContent = React.forwardRef<HTMLDivElement, ContentProps>(
  (
    {
      className,
      sideOffset = 4,
      align = "start",
      side,
      alignOffset,
      onCloseAutoFocus,
      ...props
    },
    ref,
  ) => {
    const panel = React.useRef<HTMLDivElement | null>(null);
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Positioner
          sideOffset={sideOffset}
          align={align}
          side={side}
          alignOffset={alignOffset}
          className="z-50"
          data-popup-positioner=""
        >
          <DropdownMenuPrimitive.Popup
            render={(props, state) => (
              <div {...props} aria-hidden={!state.open || undefined} />
            )}
            ref={(node) => {
              panel.current = node;
              setRef(ref, node);
            }}
            finalFocus={() => focusAllowed(panel.current, onCloseAutoFocus)}
            className={cn(
              "max-h-[var(--available-height)] min-w-[8rem] overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95",
              className,
            )}
            {...props}
          />
        </DropdownMenuPrimitive.Positioner>
      </DropdownMenuPrimitive.Portal>
    );
  },
);
DropdownMenuContent.displayName = "DropdownMenuContent";
const DropdownMenuSubContent = DropdownMenuContent;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  PrimitiveProps<typeof DropdownMenuPrimitive.Item> & {
    asChild?: boolean;
    onSelect?: (event: React.MouseEvent<HTMLElement>) => void;
    inset?: boolean;
  }
>(
  (
    { className, inset, asChild, children, onSelect, onClick, ...props },
    ref,
  ) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      render={asChild ? childRender(children) : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.(event);
      }}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 touch:py-3 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {asChild ? undefined : children}
    </DropdownMenuPrimitive.Item>
  ),
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  PrimitiveProps<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 touch:py-3 pl-8 pr-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.CheckboxItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.CheckboxItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  PrimitiveProps<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 touch:py-3 pl-8 pr-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.RadioItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.RadioItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  PrimitiveProps<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
