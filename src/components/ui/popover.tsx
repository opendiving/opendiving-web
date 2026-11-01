"use client";

import * as React from "react";
import { Popover as Primitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { Slot, childRender, type PrimitiveProps } from "./slot";
import {
  allowDismiss,
  focusAllowed,
  setRef,
  usePopupEvents,
  type PopupEvents,
} from "./popup-events";

const PopoverContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  setTriggerId: React.Dispatch<React.SetStateAction<string>>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  anchor: React.RefObject<HTMLElement | null>;
  setAnchor: (node: HTMLElement | null) => void;
  setTrigger: (node: HTMLButtonElement | null) => void;
  registerEvents: (handlers: PopupEvents) => void;
} | null>(null);

function Popover({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: Omit<Primitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const defaultTriggerId = React.useId();
  const [triggerId, setTriggerId] = React.useState(defaultTriggerId);
  const anchor = React.useRef<HTMLElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const eventsRef = usePopupEvents();
  const setAnchor = React.useCallback((node: HTMLElement | null) => {
    anchor.current = node;
  }, []);
  const setTrigger = React.useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);
  const registerEvents = React.useCallback(
    (handlers: PopupEvents) => {
      eventsRef.current = handlers;
    },
    [eventsRef],
  );
  return (
    <PopoverContext.Provider
      value={{
        anchor,
        setAnchor,
        setTrigger,
        registerEvents,
        triggerId,
        setTriggerId,
        open,
        setOpen,
        triggerRef,
      }}
    >
      <Primitive.Root
        {...props}
        triggerId={triggerId}
        open={open}
        onOpenChange={(open, details) => {
          allowDismiss(details, eventsRef.current);
          if (!details.isCanceled) setOpen(open);
        }}
      />
    </PopoverContext.Provider>
  );
}

const PopoverAnchor = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { asChild?: boolean }
>(({ asChild, ...props }, ref) => {
  const context = React.useContext(PopoverContext);
  const setAnchor = context?.setAnchor;
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      {...props}
      ref={(node) => {
        setAnchor?.(node);
        setRef(ref, node);
      }}
    />
  );
});
PopoverAnchor.displayName = "PopoverAnchor";

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  PrimitiveProps<typeof Primitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const context = React.useContext(PopoverContext);
  const setTrigger = context?.setTrigger;
  const id = props.id ?? context?.triggerId;
  const setTriggerId = context?.setTriggerId;
  React.useLayoutEffect(() => {
    if (id) setTriggerId?.(id);
  }, [id, setTriggerId]);
  return (
    <Primitive.Trigger
      type="button"
      ref={(node: HTMLButtonElement | null) => {
        setTrigger?.(node);
        setRef(ref, node);
      }}
      {...props}
      id={id}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !context) return;
        // A custom anchor is the field's box, while its icon remains a disclosure.
        event.preventBaseUIHandler();
        context.setOpen(!context.open);
      }}
      render={asChild ? childRender(children) : undefined}
    >
      {asChild ? undefined : children}
    </Primitive.Trigger>
  );
});
PopoverTrigger.displayName = "PopoverTrigger";

type ContentProps = PrimitiveProps<typeof Primitive.Popup> &
  PopupEvents &
  Pick<
    Primitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "collisionPadding"
  > & {
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
  };
const PopoverContent = React.forwardRef<HTMLDivElement, ContentProps>(
  (
    {
      className,
      align = "center",
      side,
      sideOffset = 4,
      alignOffset,
      collisionPadding,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onInteractOutside,
      onPointerDownOutside,
      onEscapeKeyDown,
      ...props
    },
    ref,
  ) => {
    const context = React.useContext(PopoverContext);
    const registerEvents = context?.registerEvents;
    const panel = React.useRef<HTMLDivElement | null>(null);
    React.useLayoutEffect(() => {
      registerEvents?.({
        onInteractOutside,
        onPointerDownOutside,
        onEscapeKeyDown,
      });
    });
    return (
      <Primitive.Portal>
        <Primitive.Positioner
          anchor={context?.anchor.current ?? undefined}
          align={align}
          side={side}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={collisionPadding}
          className="z-50"
          data-popup-positioner=""
        >
          <Primitive.Popup
            render={(props, state) => (
              <div {...props} aria-hidden={!state.open || undefined} />
            )}
            ref={(node) => {
              panel.current = node;
              setRef(ref, node);
            }}
            initialFocus={() => focusAllowed(panel.current, onOpenAutoFocus)}
            finalFocus={() =>
              focusAllowed(panel.current, onCloseAutoFocus)
                ? (context?.triggerRef.current ?? true)
                : false
            }
            className={cn(
              "w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              className,
            )}
            {...props}
          />
        </Primitive.Positioner>
      </Primitive.Portal>
    );
  },
);
PopoverContent.displayName = "PopoverContent";
export { Popover, PopoverAnchor, PopoverTrigger, PopoverContent };
