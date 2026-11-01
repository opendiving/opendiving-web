import * as React from "react";

// Keep the app's cancellable focus callbacks while Base UI asks for a focus target.
export function focusAllowed(
  panel: HTMLElement | null,
  handler?: (event: Event) => void,
) {
  if (!handler) return true;
  const event = new Event("popupfocus", { cancelable: true });
  if (panel) {
    panel.addEventListener("popupfocus", handler, { once: true });
    panel.dispatchEvent(event);
  } else {
    handler(event);
  }
  return !event.defaultPrevented;
}

export const tooltipEscapeEvents = new WeakSet<Event>();

export interface PopupEvents {
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

export function usePopupEvents() {
  return React.useRef<PopupEvents>({});
}

export function allowDismiss(
  details: { reason: string; event: Event; cancel: () => void },
  handlers: PopupEvents,
  protectForm = false,
) {
  if (
    protectForm &&
    details.reason === "escape-key" &&
    (tooltipEscapeEvents.has(details.event) ||
      document.querySelector('[role="tooltip"][data-open]'))
  ) {
    details.cancel();
    return;
  }

  if (
    details.reason === "escape-key" &&
    details.event instanceof KeyboardEvent
  ) {
    handlers.onEscapeKeyDown?.(details.event);
  }
  if (details.reason === "outside-press" || details.reason === "focus-out") {
    if (protectForm && !handlers.onPointerDownOutside) details.cancel();
    handlers.onPointerDownOutside?.(details.event);
    handlers.onInteractOutside?.(details.event);
  }
  if (
    (details.reason === "escape-key" ||
      details.reason === "outside-press" ||
      details.reason === "focus-out") &&
    details.event.defaultPrevented
  )
    details.cancel();
}

export function setRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
