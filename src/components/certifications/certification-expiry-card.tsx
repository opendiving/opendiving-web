"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import {
  certificationAgencyLabel,
  certificationsAPI,
  type CertificationExpiringEntry,
} from "@/lib/api/certifications";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationRenewals,
  type CertificationRenewal,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TruncatedNote } from "@/components/ui/truncated-note";

interface CertificationExpiryCardProps {
  userId: string;
}

// Dashboard card listing certifications that have run out, or are about to.
//
// The gear twin of this is `ServiceDueCard`, and it follows the same rule: it renders
// **nothing at all** when no card needs renewing (and when the fetch fails), because a
// permanent "your certifications are fine" tile is exactly the kind of dashboard filler
// that teaches people to stop reading the dashboard.
//
// Rows all link to `/certifications` rather than to a card of their own - certifications
// are edited in dialogs on that one page, so there is no per-certification URL to send
// anyone to.
//
// The API returns every dated certification with no horizon - a server-side "expiring
// within N days" filter would bake today's date into a cached response and go wrong at
// midnight - so the bucketing happens here, exactly as it does for gear.
export function CertificationExpiryCard({
  userId,
}: CertificationExpiryCardProps) {
  const [flagged, setFlagged] = useState<
    CertificationRenewal<CertificationExpiringEntry>[]
  >([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    certificationsAPI
      .getExpiring(userId)
      .then((response) => {
        if (cancelled) return;
        setFlagged(certificationRenewals(response.data));
        setTruncated(response.truncated === true);
      })
      // Swallowed on purpose, like `ServiceDueCard`: a supplementary card that failed to
      // load should leave the dashboard looking normal rather than showing an error tile.
      .catch((error) => console.error("Failed to load certifications:", error));

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (flagged.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4" />
          Certification renewals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flagged.map(({ certification, status, expiresOn }) => (
          <Link
            key={certification.uuid}
            href="/certifications"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{certification.name}</div>
              <div className="text-xs text-muted-foreground">
                {certificationAgencyLabel(
                  certification.agency,
                  certification.agency_other,
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={certificationExpiryBadgeVariant(status)}>
                {certificationExpiryLabel(status)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {status === "expired" ? "Expired" : "Expires"}{" "}
                {formatDateOnly(expiresOn)}
              </span>
            </div>
          </Link>
        ))}
        {truncated && <TruncatedNote where="your certifications" />}
      </CardContent>
    </Card>
  );
}
