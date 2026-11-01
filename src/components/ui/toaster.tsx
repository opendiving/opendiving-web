"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast";
import { useToast } from "./use-toast";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type Notification = ReturnType<typeof useToast>["toasts"][number];

// The application store also receives notifications before this viewport mounts.
// Base UI owns timers, announcements, keyboard dismissal, and swipe gestures.
function ToastList() {
  const { toasts: notifications } = useToast();
  const { toasts, add, update, close } = ToastPrimitive.useToastManager<{
    action?: React.ReactElement;
  }>();
  const previous = React.useRef(new Map<string, Notification>());
  const wide = useMediaQuery("(min-width: 40rem)");

  React.useEffect(() => {
    for (const [id] of previous.current) {
      if (!notifications.some((item) => item.id === id && item.open)) close(id);
    }
    for (const notification of notifications) {
      const old = previous.current.get(notification.id);
      if (!notification.open) {
        close(notification.id);
      } else if (old !== notification) {
        const options = {
          title: notification.title,
          description: notification.description,
          type: notification.variant,
          data: { action: notification.action },
          onClose: () => notification.onOpenChange?.(false),
        };
        if (old?.open) update(notification.id, options);
        else add({ ...options, id: notification.id });
      }
    }
    previous.current = new Map(notifications.map((item) => [item.id, item]));
  }, [notifications, add, update, close]);

  return (
    <ToastPrimitive.Portal>
      <ToastViewport>
        {toasts.map((item) => (
          <Toast
            key={item.id}
            toast={item}
            variant={item.type === "destructive" ? "destructive" : "default"}
            swipeDirection={wide ? "right" : "up"}
          >
            <ToastPrimitive.Content className="grid gap-1">
              {item.title && <ToastTitle>{item.title}</ToastTitle>}
              {item.description && (
                <ToastDescription>{item.description}</ToastDescription>
              )}
            </ToastPrimitive.Content>
            {item.data?.action}
            <ToastClose />
          </Toast>
        ))}
      </ToastViewport>
    </ToastPrimitive.Portal>
  );
}

export function Toaster() {
  return (
    <ToastProvider limit={1}>
      <ToastList />
    </ToastProvider>
  );
}
