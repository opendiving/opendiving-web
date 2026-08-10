"use client";

import { Download, Loader2 } from "lucide-react";
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
import { useState } from "react";

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

// Read-only view of a certification and its card images - what a diver opens at
// a dive shop counter. Large images, details underneath.
export function CertificationViewDialog({
  certification,
  onOpenChange,
}: CertificationViewDialogProps) {
  const { toast } = useToast();
  const [downloadingSide, setDownloadingSide] = useState<CertificationSide | null>(
    null,
  );

  if (!certification) return null;

  const expiry = certificationExpiryStatus(certification.expires_on);

  // Downloading goes through the API client for the same reason rendering does:
  // the endpoint needs an `Authorization` header, so a plain `<a href>` to it
  // would 401. The object URL is revoked immediately - the browser has already
  // taken its own copy by the time the synthetic click returns.
  const handleDownload = async (side: CertificationSide) => {
    const file = certificationFile(certification, side);
    if (!file) return;

    try {
      setDownloadingSide(side);
      const blob = await certificationsAPI.getCertificationFileBlob(
        certification.uuid,
        side,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.original_filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
            <DetailRow
              label="Training center"
              value={certification.training_center}
            />
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
