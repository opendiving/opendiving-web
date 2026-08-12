"use client";

import * as React from "react";

type ToastProps = {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  variant?: "default" | "destructive";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ToastActionElement = React.ReactElement;

const TOAST_LIMIT = 1;
// How long a dismissed toast's row lingers in state before being dropped. It only
// has to outlast Radix's exit animation - the toast is already on its way out, and
// the row exists purely so there is something to animate.
//
// Upstream ships `1000000` (~16.7 minutes), which with `TOAST_LIMIT = 1` pins every
// toast the app has ever shown in `memoryState`. It is a well-known bug in the
// shadcn/ui toast rather than a considered value.
//
// Note this is *not* how long a toast is on screen - Radix owns that (5s by default,
// after which it calls `onOpenChange(false)` and the row is marked closed). This only
// governs how long the closed row sticks around for the exit animation.
const TOAST_REMOVE_DELAY = 1000;

type ToasterToast = ToastProps & {
  id: string;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

// The store is module-level rather than a context, so `toast()` can be called from
// anywhere - including outside React - without a provider in scope.
const listeners = new Set<() => void>();

let memoryState: State = { toasts: [] };

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

// `useSyncExternalStore` requires this to return a referentially stable value for an
// unchanged store - returning a fresh object here would loop forever. Every reducer
// branch already produces a new `State`, so handing back the current one is correct.
function getSnapshot(): State {
  return memoryState;
}

// Rendered on the server as an empty list. Toasts are only ever raised in response to
// something the user did, so there is nothing to hydrate and no mismatch to cause.
const SERVER_SNAPSHOT: State = { toasts: [] };

function getServerSnapshot(): State {
  return SERVER_SNAPSHOT;
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener();
  });
}

type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  // `useSyncExternalStore` rather than upstream's `useState` + `useEffect` pair -
  // this is a module-level external store, which is exactly what that hook is for.
  //
  // The pair has a real gap. `dispatch` notifies whoever is in `listeners` at that
  // instant and nothing re-delivers, but the subscription is set up in an *effect*,
  // so a toast raised before that effect runs is delivered to nobody. It happens:
  // `<Toaster />` is a later sibling of `<AppShell>` in the root layout, so a page's
  // effects run first, and instrumenting `dispatch` on a page that toasts as soon as
  // its data fails to load catches it in the act - `ADD_TOAST listeners= 0`.
  //
  // Upstream mostly gets away with it because a component mounting *after* the
  // dispatch seeds `useState(memoryState)` from the store. What it cannot recover is
  // a subscriber that was already rendered when the toast landed. `useSyncExternalStore`
  // has no such gap: React reads the snapshot during render and checks it again after
  // subscribing, so a change in between is picked up rather than lost.
  const state = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
