"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import {
  certificationsAPI,
  certificationAgencyLabel,
  Certification,
} from "@/lib/api/certifications";
import { formatDateOnly } from "@/lib/date-time";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";

// How many of a course's cards to show. A course issues one or two in practice
// (TDI's Advanced Nitrox + Decompression Procedures is the archetype); this is a
// ceiling, not a page size, and the card deliberately does not paginate.
const CERTIFICATIONS_LIMIT = 50;

interface CourseCertificationsCardProps {
  userId: string;
  courseUuid: string;
}

/**
 * The certifications one course issued, on that course's page.
 *
 * Certifications have no detail route of their own by design, so each row opens
 * the same read-only view dialog the certifications list opens - which is what
 * makes a card reachable from here rather than merely listed.
 */
export function CourseCertificationsCard({
  userId,
  courseUuid,
}: CourseCertificationsCardProps) {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewing, setViewing] = useState<Certification | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    certificationsAPI
      .getCertifications(userId, 1, CERTIFICATIONS_LIMIT, courseUuid)
      .then((response) => {
        if (cancelled) return;
        setCertifications(response.data);
      })
      // Supplementary to the page, like the dashboard's own cards: a failed
      // fetch leaves this empty rather than turning the course page into an
      // error.
      .catch((error) =>
        console.error("Failed to fetch the course's certifications:", error),
      )
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, courseUuid]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle as="h2" className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5" />
              Certifications from this Course
            </CardTitle>
            <CardDescription>
              The cards this training issued. Link one from its own form.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListRowsSkeleton rows={2} />
          ) : certifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No certifications linked to this course yet.
            </p>
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

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </>
  );
}
