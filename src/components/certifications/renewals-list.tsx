"use client";

import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  type CertificationRenewal,
  type Renewable,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { TruncatedNote } from "@/components/ui/truncated-note";
import { NotificationRow } from "@/components/layout/notification-row";

interface RenewalsListProps {
  // Already flagged and sorted, soonest first - see `certificationRenewals`.
  renewals: CertificationRenewal<Renewable>[];
  truncated: boolean;
  // Called as a row's title link is followed, so whatever holds the list can close.
  onNavigate: () => void;
  // A click on the row: open the form whose "Expires on" this is.
  onRenew: (row: Renewable) => void;
}

// What a diver has to renew - certifications that have run out or are about to, and
// the insurance policies among them.
export function RenewalsList({
  renewals,
  truncated,
  onNavigate,
  onRenew,
}: RenewalsListProps) {
  return (
    <div className="space-y-1">
      {renewals.map(({ certification: row, status, expiresOn }) => (
        <NotificationRow
          key={row.key}
          title={row.title}
          href={row.href}
          subtitle={row.detail}
          // "Expiring soon" is the wider of the two labels; `min-w-28` clears it with
          // room for a fallback font, and `whitespace-nowrap` keeps a chip that
          // outgrows it one line tall.
          badge={
            <Badge
              variant={certificationExpiryBadgeVariant(status)}
              className="min-w-28 justify-center whitespace-nowrap"
            >
              {certificationExpiryLabel(status)}
            </Badge>
          }
          qualifier={`on ${formatDateOnly(expiresOn)}`}
          actionLabel={
            row.kind === "insurance"
              ? `Edit your ${row.title} policy`
              : `Edit ${row.title}`
          }
          onAction={() => onRenew(row)}
          onNavigate={onNavigate}
        />
      ))}
      {truncated && <TruncatedNote where="your certifications" />}
    </div>
  );
}
