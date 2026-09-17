"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import {
  certificationsAPI,
  certificationFile,
  Certification,
  CertificationSide,
  CERTIFICATION_FILE_ACCEPT,
  CERTIFICATION_SIDES,
  CERTIFICATION_SIDE_HEADINGS,
  CERTIFICATION_SIDE_LABELS,
  MAX_CERTIFICATION_FILE_SIZE,
} from "@/lib/api/certifications";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatFileSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { CertificationCardImage } from "./certification-card-image";

interface CertificationCardFilesProps {
  certification: Certification;
  // Called after an upload or removal so the caller can refresh the embedded
  // file metadata the API returns with the certification.
  onChanged: () => void | Promise<void>;
}

// Upload / replace / remove the stored images of one certification card.
//
// Both slots are always shown, empty or not, but only the first is expected to
// be filled: modern e-cards are usually one-sided, so the second slot is
// optional and its heading says so. Keeping it on screen is what lets the diver
// holding a two-sided card - TDI/SDI still prints one - find somewhere to put
// the back without hunting for a control that only appears once it is needed.
export function CertificationCardFiles({
  certification,
  onChanged,
}: CertificationCardFilesProps) {
  const { toast } = useToast();
  const [busySide, setBusySide] = useState<CertificationSide | null>(null);
  // One ref per side; a single shared input can't tell us which slot was clicked.
  const inputRefs = {
    front: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
  };

  const handleFileSelected = async (
    side: CertificationSide,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Checked here as well as by the API so a diver on a slow connection isn't
      // made to upload 40 MB before being told no. The API re-checks regardless,
      // and its check is the one that counts.
      if (file.size > MAX_CERTIFICATION_FILE_SIZE) {
        toast({
          title: "File too large",
          description: "Card images must be 10 MB or smaller.",
          variant: "destructive",
        });
        return;
      }

      setBusySide(side);
      await certificationsAPI.uploadCertificationFile(
        certification.uuid,
        side,
        file,
      );
      await onChanged();

      toast({
        title: "Card saved",
        description: `${CERTIFICATION_SIDE_LABELS[side]} of your card was uploaded.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to upload the image. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusySide(null);
      // Reset so picking the same file again still fires a change event.
      event.target.value = "";
    }
  };

  const handleRemove = async (side: CertificationSide) => {
    try {
      setBusySide(side);
      await certificationsAPI.deleteCertificationFile(certification.uuid, side);
      await onChanged();

      toast({
        title: "Image removed",
        description: `${CERTIFICATION_SIDE_LABELS[side]} image deleted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to remove the image. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusySide(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {CERTIFICATION_SIDES.map((side) => {
          const file = certificationFile(certification, side);
          const isBusy = busySide === side;

          return (
            <div key={side} className="space-y-2">
              <p className="text-sm font-medium">
                {CERTIFICATION_SIDE_HEADINGS[side]}
              </p>

              <CertificationCardImage
                certificationUuid={certification.uuid}
                side={side}
                file={file}
              />

              <input
                ref={inputRefs[side]}
                type="file"
                accept={CERTIFICATION_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => handleFileSelected(side, event)}
              />

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => inputRefs[side].current?.click()}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Working...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {file ? "Replace" : "Upload"}
                    </>
                  )}
                </Button>

                {file && (
                  <IconTooltip label={`Remove ${side} image`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => handleRemove(side)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </IconTooltip>
                )}
              </div>

              {file && (
                <p className="text-xs text-muted-foreground truncate">
                  {file.original_filename} · {formatFileSize(file.byte_size)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Said before the upload rather than after it: RAID hands out a PNG and
          a PDF of the same card, so the choice is the diver's to make here. The
          formats named are every non-PDF entry in `CERTIFICATION_FILE_ACCEPT`.
          Why a PDF cannot be shown is `CertificationCardImage`'s to explain. */}
      <p className="text-xs text-muted-foreground">
        PNG, JPEG and WEBP images are shown here. A PDF is stored and can be
        downloaded, but not displayed — if your agency offers both, pick the
        image.
      </p>
    </div>
  );
}
