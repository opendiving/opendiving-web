"use client";

import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { coursesAPI, Course } from "@/lib/api/courses";
import { useContact } from "@/hooks/useContact";
import {
  certificationsAPI,
  certificationAgencyLabel,
  certificationFile,
  Certification,
  CertificationSide,
  CERTIFICATION_SIDES,
  CERTIFICATION_SIDE_LABELS,
} from "@/lib/api/certifications";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationExpiryStatus,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";
import { downloadBlob } from "@/lib/download";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { CertificationCardImage } from "./certification-card-image";
import { useEffect, useState } from "react";

interface CertificationViewDialogProps {
  certification: Certification | null;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

// The course this card came out of, as a link to it.
//
// The certification carries the course's uuid and nothing else, so the name has
// to be fetched - and the row only appears once it has arrived. A failed lookup
// is non-fatal and leaves the row out, exactly as the dive page's trip link does:
// the rest of the dialog is what the diver opened it for.
function CourseRow({ courseUuid }: { courseUuid: string }) {
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    let cancelled = false;

    coursesAPI
      .getCourse(courseUuid)
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch((error) => console.error("Failed to fetch course:", error));

    return () => {
      cancelled = true;
    };
  }, [courseUuid]);

  if (!course) return null;

  return (
    <div>
      <dt className="text-xs text-muted-foreground">Course</dt>
      <dd className="text-sm">
        <Link href={`/courses/${course.uuid}`} className="hover:underline">
          {course.name}
        </Link>
      </dd>
    </div>
  );
}

// Who ran the course the card came out of, on `CourseRow`'s terms: the
// certification carries the contact's uuid and nothing else, so the row appears
// once the name has arrived, and a failed lookup leaves it out.
function ContactRow({ contactUuid }: { contactUuid: string }) {
  const contact = useContact(contactUuid);
  if (!contact) return null;

  return (
    <div>
      <dt className="text-xs text-muted-foreground">Dive center</dt>
      <dd className="text-sm">{contact.name}</dd>
    </div>
  );
}

// Read-only view of a certification and its card images - what a diver opens at
// a dive shop counter. Large images, details underneath.
export function CertificationViewDialog({
  certification,
  onOpenChange,
}: CertificationViewDialogProps) {
  const { toast } = useToast();
  const [downloadingSide, setDownloadingSide] =
    useState<CertificationSide | null>(null);

  if (!certification) return null;

  const expiry = certificationExpiryStatus(certification.expires_on);

  // Downloading goes through the API client for the same reason rendering does:
  // the endpoint needs an `Authorization` header, so a plain `<a href>` to it
  // would 401. See `lib/download.ts` for why the object URL outlives the click -
  // revoking it synchronously looks fine in Chrome and silently cancels the
  // download in Firefox and Safari.
  const handleDownload = async (side: CertificationSide) => {
    const file = certificationFile(certification, side);
    if (!file) return;

    try {
      setDownloadingSide(side);
      const blob = await certificationsAPI.getCertificationFileBlob(
        certification.uuid,
        side,
      );
      downloadBlob(blob, file.original_filename);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to download the file. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setDownloadingSide(null);
    }
  };

  return (
    <Dialog open={!!certification} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{certification.name}</span>
            <Badge variant="outline">
              {certificationAgencyLabel(
                certification.agency,
                certification.agency_other,
              )}
            </Badge>
            {expiry && (
              <Badge variant={certificationExpiryBadgeVariant(expiry)}>
                {certificationExpiryLabel(expiry)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {CERTIFICATION_SIDES.map((side) => {
              const file = certificationFile(certification, side);
              return (
                <div key={side} className="space-y-2">
                  <p className="text-sm font-medium">
                    {CERTIFICATION_SIDE_LABELS[side]}
                  </p>
                  <CertificationCardImage
                    certificationUuid={certification.uuid}
                    side={side}
                    file={file}
                  />
                  {file && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadingSide === side}
                      onClick={() => handleDownload(side)}
                    >
                      {downloadingSide === side ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Preparing...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailRow
              label="Certification number"
              value={certification.certification_number}
            />
            {certification.course_uuid && (
              <CourseRow courseUuid={certification.course_uuid} />
            )}
            <DetailRow
              label="Certified on"
              value={
                certification.certified_on
                  ? formatDateOnly(certification.certified_on)
                  : null
              }
            />
            <DetailRow
              label="Expires on"
              value={
                certification.expires_on
                  ? formatDateOnly(certification.expires_on)
                  : null
              }
            />
            {certification.contact_uuid && (
              <ContactRow contactUuid={certification.contact_uuid} />
            )}
            <DetailRow
              label="Instructor"
              value={certification.instructor_name}
            />
            <DetailRow
              label="Instructor number"
              value={certification.instructor_number}
            />
          </dl>

          {certification.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap">
                {certification.notes}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
