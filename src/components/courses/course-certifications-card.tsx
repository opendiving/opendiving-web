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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CertificationCardFiles } from "@/components/certifications/certification-card-files";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";

// How many of a course's cards to show. A course issues one or two in practice
// (TDI's Advanced Nitrox + Decompression Procedures is the archetype); this is a
// ceiling, not a page size, and the card deliberately does not paginate.
const CERTIFICATIONS_LIMIT = 50;

interface CourseCertificationsCardProps {
  // The whole course, not just its uuid: "Add certification" opens a dialog
  // pre-linked to it *and* prefilled from its training center, instructor and
  // agency where it names one, and the page has already loaded every one of
  // those.
  course: Course;
}

/**
 * The certifications one course issued, on that course's page.
 *
 * Certifications have no detail route of their own by design, so each row opens
 * the same read-only view dialog the certifications list opens - which is what
 * makes a card reachable from here rather than merely listed.
 *
 * It also owns the create flow, rather than the page owning it and pushing a
 * refresh signal down: the list this card fetches is the thing a new
 * certification has to appear in, and keeping both here means the refetch is a
 * call rather than a prop contract to keep in step.
 */
export function CourseCertificationsCard({
  course,
}: CourseCertificationsCardProps) {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewing, setViewing] = useState<Certification | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // The certification whose card images are being managed, if any.
  const [managingFiles, setManagingFiles] = useState<Certification | null>(
    null,
  );

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

  // After a card image changes, the row's embedded file metadata is stale.
  // Refetch and re-point the open dialog at the refreshed record, so the panel
  // the diver is looking at updates rather than showing what it loaded with -
  // the same handoff the certifications page makes.
  const refreshAfterFileChange = useCallback(async () => {
    if (!managingFiles) return;
    setManagingFiles(
      await certificationsAPI.getCertification(managingFiles.uuid),
    );
    await refresh();
  }, [managingFiles, refresh]);

  // Two ways to the same dialog, named differently on purpose: a screen
  // reader's controls list is flat, and two identical "Add certification"
  // entries in one card say nothing about which is which. Same reason the
  // certifications page pairs "New Certification" with "Add Your First
  // Certification" - see DECISIONS.md, "Ten rows of 'Edit' name nothing".
  const addButton = (label: string) => (
    <Button size="sm" onClick={() => setIsCreating(true)}>
      <Plus className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle as="h2" className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5" />
                Certifications from this Course
              </CardTitle>
              {/* "Link one from its own form" until this card grew a button
                  of its own, which made that the long way round rather than
                  the only way. Linking from the certification form still
                  works, so it stays in the sentence as the alternative. */}
              <CardDescription>
                The cards this training issued. Add one here, or link an
                existing card from its own form.
              </CardDescription>
            </div>
            {addButton("Add certification")}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListRowsSkeleton rows={2} />
          ) : certifications.length === 0 ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                No certifications linked to this course yet.
              </p>
              {addButton("Add the first certification")}
            </div>
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
        open={isCreating}
        onOpenChange={setIsCreating}
        initialCourse={course}
        onSaved={(saved) => {
          refresh();
          // A brand-new certification has no card images yet, and adding them is
          // the whole point - so go straight on to the upload step rather than
          // making the diver find the button, exactly as the certifications page
          // does.
          setManagingFiles(saved);
        }}
      />

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      {managingFiles && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setManagingFiles(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Card images — {managingFiles.name}</DialogTitle>
            </DialogHeader>
            <CertificationCardFiles
              certification={managingFiles}
              onChanged={refreshAfterFileChange}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
