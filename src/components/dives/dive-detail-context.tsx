"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dive } from "@/lib/api/dives";
import type { Trip } from "@/lib/api/trips";
import type { Course } from "@/lib/api/courses";
import type { Contact } from "@/lib/api/contacts";

export interface DiveDetailValue {
  /**
   * Never null. The provider is the `(detail)` layout, which renders a skeleton
   * or a not-found state instead of its children until it holds a dive - so
   * anything below it is looking at a real one, and the dive being *replaced*
   * during a step is still a real one.
   */
  dive: Dive;
  /** A neighbouring dive is on its way in; `dive` is the one being stepped away from. */
  isLoading: boolean;
  /** The dive's trip, training course and contact, or null where it has none or the lookup failed. */
  trip: Trip | null;
  course: Course | null;
  contact: Contact | null;
  /** Re-reads the dive without touching `isLoading` - see `useResource`. */
  refreshDive: () => void;
}

// No default value. A default would let a consumer render outside the layout
// against a dive that doesn't exist, and the only honest default for `dive` is
// null - which is exactly the case the layout exists to keep out of this tree.
const DiveDetailContext = createContext<DiveDetailValue | null>(null);

/**
 * Carries the dive from the route-group layout that fetches it down to the page
 * that renders it.
 *
 * The split exists because the App Router keys `[id]` on the param, so the page
 * is destroyed and rebuilt on every step of the prev/next pager. The layout
 * sits above that segment and survives, which is what lets the outgoing dive
 * stay on screen while the next one loads - and what keeps the pager's own
 * `<a>` alive under the focus that is on it. See "`dives/(detail)/layout.tsx`
 * owns the dive fetch, so a step keeps the page mounted" in DECISIONS.md.
 */
export function DiveDetailProvider({
  value,
  children,
}: {
  value: DiveDetailValue;
  children: ReactNode;
}) {
  return (
    <DiveDetailContext.Provider value={value}>
      {children}
    </DiveDetailContext.Provider>
  );
}

/** The dive the `/dives/[id]` layout has loaded, for the page rendered inside it. */
export function useDiveDetail(): DiveDetailValue {
  const value = useContext(DiveDetailContext);
  if (!value) {
    throw new Error("useDiveDetail must be used inside the dive detail layout");
  }
  return value;
}
