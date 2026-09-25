"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import {
  certificationsAPI,
  certificationAgencyLabel,
  Certification,
} from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";
import { formatDateOnly } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";

// How many of a course's cards to show. A course issues one or two in practice
// (TDI's Advanced Nitrox + Decompression Procedures is the archetype); this is a
// ceiling, not a page size, and the card deliberately does not paginate.
const CERTIFICATIONS_LIMIT = 50;

interface CourseCertificationsCardProps {
  // The whole course, not just its uuid: adding a certification opens a dialog
  // pre-linked to it *and* prefilled from its contact, instructor and agency
  // where it names one, and the page has already loaded every one of those.
  course: Course;
  /**
   * Opened by the page's sidebar button as well as by this card's own empty
   * state, so the page holds the flag and the card is told about it.
   */
  isAdding: boolean;
  onAddingChange: (adding: boolean) => void;
}

/**
 * The certifications one course issued, on that course's page.
 *
 * Certifications have no detail route of their own by design, so each row opens
 * the same read-only view dialog the certifications list opens - which is what
 * makes a card reachable from here rather than merely listed.
 *
 * It owns the dialogs the create flow needs, rather than the page owning them
 * and pushing a refresh signal down: the list this card fetches is the thing a
 * new certification has to appear in, and keeping both here means the refetch
 * is a call rather than a prop contract to keep in step. Only the "is the
 * create dialog open" flag lives above it, because the sidebar opens it too.
 */
export function CourseCertificationsCard({
  course,
  isAdding,
  onAddingChange,
}: CourseCertificationsCardProps) {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewing, setViewing] = useState<Certification | null>(null);

  const courseUuid = course.uuid;

  // Keyed on the uuid rather than on `course`, so a page re-render handing down
  // an equal-but-new object doesn't re-fetch the list.
  const fetchCertifications = useCallback(
    () =>
      certificationsAPI
        .getCertifications(1, CERTIFICATIONS_LIMIT, courseUuid)
        .then((response) => response.data)
        // Supplementary to the page, like the dashboard's own cards: a failed
        // fetch leaves this empty rather than turning the course page into an
        // error.
        .catch((error) => {
          console.error("Failed to fetch the course's certifications:", error);
          return null;
        }),
    [courseUuid],
  );

  useEffect(() => {
    let cancelled = false;

    fetchCertifications()
      .then((data) => {
        if (cancelled || !data) return;
        setCertifications(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCertifications]);

  const refresh = useCallback(async () => {
    const data = await fetchCertifications();
    if (data) setCertifications(data);
  }, [fetchCertifications]);

  return (
    <>
      <Card>
        {/* Title and description as direct children, with no wrapper: this
            card carries no header control, and a `<div>` around the
            pair would eat `CardHeader`'s own 6px gap. */}
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5" />
            Certifications from this Course
          </CardTitle>
          {/* The sidebar's button is not the only way in: an existing card can
              name this course from its own form, which is how a card logged
              before the course was. */}
          <CardDescription>
            The cards this training issued. An existing card can name this
            course from its own form too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListRowsSkeleton rows={2} />
          ) : certifications.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No certifications from this course yet"
              description="Add the card this training issued and it will appear here."
              action={
                <Button onClick={() => onAddingChange(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add the first certification
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {certifications.map((certification) => (
                <li key={certification.uuid}>
                  <button
                    type="button"
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors"
                    onClick={() => setViewing(certification)}
                  >
                    <div className="font-medium text-foreground">
                      {certification.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {certificationAgencyLabel(
                        certification.agency,
                        certification.agency_other,
                      )}
                      {certification.certified_on && (
                        <>
                          {" · "}
                          {formatDateOnly(certification.certified_on)}
                        </>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CertificationDialog
        open={isAdding}
        onOpenChange={onAddingChange}
        initialCourse={course}
        // The card images were picked in that dialog too, so a refetch is the
        // whole of what happens here now.
        onSaved={() => refresh()}
      />

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </>
  );
}
