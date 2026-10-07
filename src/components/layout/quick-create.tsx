"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { TripDialog } from "@/components/trips/trip-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CourseDialog } from "@/components/courses/course-dialog";
import { PersonDialog } from "@/components/people/person-dialog";

// Everything that can be created from anywhere in the app. A dive is missing on
// purpose: it's the one form too big for a dialog, so it stays a page
// (`/dives/new`) and is linked to rather than opened from here.
export type QuickCreateKind =
  "trip" | "site" | "gear" | "certification" | "course" | "person";

const QuickCreateContext = createContext<
  ((kind: QuickCreateKind) => void) | null
>(null);

// Opens the create dialog for `kind` from anywhere under the app shell - the
// header's "+" menu, a list page's "New" button, an empty-state button on the
// Home page, and so on.
export function useQuickCreate() {
  const openCreate = useContext(QuickCreateContext);
  if (!openCreate) {
    throw new Error("useQuickCreate must be used inside a QuickCreateProvider");
  }
  return openCreate;
}

// Hosts one instance of every quick-create dialog for the whole app, so any
// component can start a create without owning dialog state (or a copy of the
// form) itself.
//
// Pickers inside the dive form deliberately keep their own dialog instances:
// they need the created item handed back so they can select it, which is a
// different job from "create something and go look at it".
export function QuickCreateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const withReturnTo = useWithReturnTo();
  const [kind, setKind] = useState<QuickCreateKind | null>(null);

  const openCreate = useCallback((next: QuickCreateKind) => setKind(next), []);

  // Take the diver to what they just made - its own page where there is one,
  // which leads back to the page it was made on, otherwise the section list -
  // even from that section's own list, where the new row would land wherever
  // the sort puts it, often out of sight.
  const goTo = (href: string) => {
    setKind(null);
    router.push(href);
  };

  const close = (open: boolean) => {
    if (!open) setKind(null);
  };

  return (
    <QuickCreateContext.Provider value={openCreate}>
      {children}

      {user && (
        <>
          <TripDialog
            open={kind === "trip"}
            onOpenChange={close}
            onSaved={(trip) => goTo(withReturnTo(`/trips/${trip.uuid}`))}
          />
          <DiveSiteDialog
            open={kind === "site"}
            onOpenChange={close}
            onSaved={(diveSite) =>
              goTo(withReturnTo(`/sites/${diveSite.uuid}`))
            }
          />
          <GearItemDialog
            open={kind === "gear"}
            onOpenChange={close}
            onSaved={(gearItem) => goTo(withReturnTo(`/gear/${gearItem.uuid}`))}
          />
          <CertificationDialog
            open={kind === "certification"}
            onOpenChange={close}
            onSaved={() => goTo("/certifications")}
          />
          <CourseDialog
            open={kind === "course"}
            onOpenChange={close}
            onSaved={(course) => goTo(withReturnTo(`/courses/${course.uuid}`))}
          />
          <PersonDialog
            open={kind === "person"}
            onOpenChange={close}
            onSaved={(person) => goTo(withReturnTo(`/people/${person.uuid}`))}
          />
        </>
      )}
    </QuickCreateContext.Provider>
  );
}
