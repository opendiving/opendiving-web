"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { TripDialog } from "@/components/trips/trip-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CourseDialog } from "@/components/courses/course-dialog";

// Everything that can be created from anywhere in the app. A dive is missing on
// purpose: it's the one form too big for a dialog, so it stays a page
// (`/dives/new`) and is linked to rather than opened from here.
export type QuickCreateKind =
  "trip" | "site" | "gear" | "certification" | "course";

const QuickCreateContext = createContext<
  ((kind: QuickCreateKind) => void) | null
>(null);

// Opens the create dialog for `kind` from anywhere under the app shell - the
// header's "+" menu, an empty-state button on the dashboard, and so on.
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
  const [kind, setKind] = useState<QuickCreateKind | null>(null);

  const openCreate = useCallback((next: QuickCreateKind) => setKind(next), []);

  // Creating from here is a deliberate detour, so take the diver to what they
  // just made - its own page where there is one, otherwise the section list.
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
            userId={user.uuid}
            open={kind === "trip"}
            onOpenChange={close}
            onSaved={(trip) => goTo(`/trips/${trip.uuid}`)}
          />
          <DiveSiteDialog
            userId={user.uuid}
            open={kind === "site"}
            onOpenChange={close}
            onSaved={(diveSite) => goTo(`/sites/${diveSite.uuid}`)}
          />
          <GearItemDialog
            userId={user.uuid}
            open={kind === "gear"}
            onOpenChange={close}
            onSaved={(gearItem) => goTo(`/gear/${gearItem.uuid}`)}
          />
          <CertificationDialog
            userId={user.uuid}
            open={kind === "certification"}
            onOpenChange={close}
            onSaved={() => goTo("/certifications")}
          />
          <CourseDialog
            userId={user.uuid}
            open={kind === "course"}
            onOpenChange={close}
            onSaved={(course) => goTo(`/courses/${course.uuid}`)}
          />
        </>
      )}
    </QuickCreateContext.Provider>
  );
}
