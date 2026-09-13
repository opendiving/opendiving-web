"use client";

import { useSyncExternalStore } from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

/**
 * Tailwind's `sm`, spelled out. `ToastViewport` puts the stack at the top of a
 * phone and in the bottom-right corner from here up, and the direction a toast
 * is thrown away in has to be the one that carries it off screen - so this
 * breakpoint and the `sm:` variants over in `toast.tsx` are one decision and
 * have to stay the same number.
 */
const WIDE_VIEWPORT = "(min-width: 40rem)";

/**
 * Whether the toast stack is in its bottom-right corner rather than across the
 * top of the screen.
 *
 * `useSyncExternalStore` rather than an effect, so the first client render
 * already has the answer and no toast is ever briefly swipeable in the wrong
 * direction. The server snapshot is `false` because the classes it pairs with
 * are mobile-first: the narrow layout is what the markup says before any
 * `sm:` rule applies, and a server that guessed `true` would disagree with its
 * own HTML.
 */
function useWideViewport() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia(WIDE_VIEWPORT);
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(WIDE_VIEWPORT).matches,
    () => false,
  );
}

export function Toaster() {
  const { toasts } = useToast();
  const isWide = useWideViewport();

  return (
    // Swiped away in the direction the toast is already sitting in. Radix's
    // default is `right` at every width, which on a phone is a banner across
    // the top of the screen that only leaves sideways - not what iOS teaches,
    // where a notification at the top is flicked *up* and away. The corner it
    // occupies from `sm` up makes `right` the natural one again there, so the
    // direction follows the placement rather than being picked once.
    <ToastProvider swipeDirection={isWide ? "right" : "up"}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
