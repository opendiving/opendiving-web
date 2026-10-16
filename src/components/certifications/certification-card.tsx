"use client";

import { useCallback } from "react";
import { BadgeCheck, Edit, FileText, ImageOff } from "lucide-react";
import {
  certificationsAPI,
  certificationAgencyLabel,
  certificationFile,
  certificationLabel,
  type Certification,
  type CertificationFileInfo,
} from "@/lib/api/certifications";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationExpiryStatus,
  certificationFileVersion,
  CERTIFICATION_CARD_ASPECT_CLASS,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { cn } from "@/lib/utils";

// As many to a row as fit at 20rem or more: three on a wide screen, one on a
// phone. A card is a c-card's shape at any width, so a wider one is only a
// taller one; 20rem holds the two figures' columns and leaves the details room
// under the menu. Spaced as /dives spaces its cards.
export const CERTIFICATION_CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4 max-sm:gap-2.5";

// Wider than a dive's figures, since a number runs to a dozen characters -
// `DE24-222-137` - and the date after it to `Dec 28, 2025`. Anything wider still
// widens its column rather than running into the next one.
const FIGURE_COLUMNS = "auto-cols-[minmax(7.5rem,auto)]";

// The card's front behind its details, faded into the card's colour as a
// species' photo is. The map's water and an icon where there is no picture to
// show: no front stored, a PDF, which is never drawn, or a fetch that failed.
// Nothing while the picture is on its way, so a card that has one does not
// flash an icon first. Decorative: the name over it says what it is.
function CertificationBackdrop({
  certificationUuid,
  file,
  coveredBottom,
}: {
  certificationUuid: string;
  file: CertificationFileInfo | undefined;
  coveredBottom: number;
}) {
  const isPdf = file?.content_type === "application/pdf";
  // In the deps, or replacing the front leaves the old picture behind - see
  // `certificationFileVersion`.
  const version = certificationFileVersion(file);
  const fetchBlob = useCallback(
    () =>
      certificationsAPI.getCertificationFileBlob(
        certificationUuid,
        "front",
        version ?? undefined,
      ),
    [certificationUuid, version],
  );
  const { url, isLoading } = useAuthedBlobUrl(
    file && !isPdf ? fetchBlob : null,
  );

  if (isLoading) return null;
  if (!url) {
    return (
      <UnplacedBackdrop
        coveredBottom={coveredBottom}
        icon={!file ? BadgeCheck : isPdf ? FileText : ImageOff}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see CertificationCardImage */}
      <img src={url} alt="" className="size-full object-cover" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
        }}
      />
    </div>
  );
}

interface CertificationCardProps {
  certification: Certification;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One certification as a card, on /certifications: the c-card's front as the
// backdrop, the card drawn in its shape so the front shows whole, its level
// over the foot of it with the agency under, and the number a dive shop asks
// for and when it was earned as its figures. The level opens the card in full,
// a certification having no page of its own.
export function CertificationCard({
  certification,
  onView,
  onEdit,
  onDelete,
  isDeleting,
}: CertificationCardProps) {
  const expiry = certificationExpiryStatus(certification.expires_on);
  const figures: BackdropCardFigure[] = [];
  if (certification.certification_number) {
    figures.push({
      label: "Number",
      value: certification.certification_number,
    });
  }
  if (certification.certified_on) {
    figures.push({
      label: "Certified",
      value: formatDateOnly(certification.certified_on),
    });
  }

  return (
    <BackdropCard
      // The agency goes in the name because two cards may share a level - see
      // DECISIONS.md, "Ten rows of 'Edit' name nothing".
      actionsLabel={`Actions for ${certificationLabel(certification)}`}
      actions={
        <>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
      shape={CERTIFICATION_CARD_ASPECT_CLASS}
      backdrop={(coveredBottom) => (
        <CertificationBackdrop
          certificationUuid={certification.uuid}
          // The API embeds each card's file metadata, so a card with no
          // picture asks for nothing.
          file={certificationFile(certification, "front")}
          coveredBottom={coveredBottom}
        />
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={onView}
          // The details' glow: a browser's own stylesheet sets a button's
          // `text-shadow` to none, where a link inherits it.
          className={cn(BACKDROP_CARD_LINK, "text-left [text-shadow:inherit]")}
        >
          {certification.name}
        </button>
        {expiry && (
          // Filled, so it takes no glow, as a dive card's chips take none.
          <Badge
            variant={certificationExpiryBadgeVariant(expiry)}
            className="[text-shadow:none]"
          >
            {certificationExpiryLabel(expiry)}
          </Badge>
        )}
      </div>
      <div className="text-xs">
        {certificationAgencyLabel(
          certification.agency,
          certification.agency_other,
        )}
      </div>
      {figures.length > 0 && (
        <BackdropCardFigures figures={figures} className={FIGURE_COLUMNS} />
      )}
    </BackdropCard>
  );
}
