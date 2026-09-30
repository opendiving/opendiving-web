"use client";

import Link from "next/link";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  type CertificationRenewal,
  type Renewable,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { TruncatedNote } from "@/components/ui/truncated-note";

interface RenewalsListProps {
  // Already flagged and sorted, soonest first - see `certificationRenewals`.
  renewals: CertificationRenewal<Renewable>[];
  truncated: boolean;
  // Called as a row's link is followed, so whatever holds the list can close.
  onNavigate: () => void;
}

// What a diver has to renew - certifications that have run out or are about to, and
// the dive insurance among them.
export function RenewalsList({
  renewals,
  truncated,
  onNavigate,
}: RenewalsListProps) {
  return (
    <div className="space-y-3">
      {renewals.map(({ certification: row, status, expiresOn }) => (
        <Link
          key={row.key}
          href={row.href}
          onClick={onNavigate}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">{row.title}</div>
            {row.detail && (
              <div className="text-xs text-muted-foreground">{row.detail}</div>
            )}
          </div>
          {/* Detail first, then the chip, and one width for both chips - the same
              treatment as the service-due rows beside these, for the same reason.
              These rows are `justify-between`, so a leading badge would park the
              coloured chip mid-row and leave the grey date on the edge the rows
              align on. `ml-auto` holds that edge once a long name wraps the pair
              onto a second line. "Expiring soon" is the wider of the two labels;
              `min-w-28` clears it with room for a fallback font, and
              `whitespace-nowrap` keeps a chip that outgrows it one line tall. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              {status === "expired" ? "Expired" : "Expires"}{" "}
              {formatDateOnly(expiresOn)}
            </span>
            <Badge
              variant={certificationExpiryBadgeVariant(status)}
              className="min-w-28 justify-center whitespace-nowrap"
            >
              {certificationExpiryLabel(status)}
            </Badge>
          </div>
        </Link>
      ))}
      {truncated && <TruncatedNote where="your certifications" />}
    </div>
  );
}
