"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  certificationAgencyLabel,
  certificationsAPI,
  type CertificationExpiringEntry,
} from "@/lib/api/certifications";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationRenewals,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TruncatedNote } from "@/components/ui/truncated-note";

// One line of the card, whatever it is a renewal of: what runs out, what kind of
// thing it is, where the diver goes to deal with it, and the date it runs out on.
interface Renewable {
  key: string;
  title: string;
  detail: string | null;
  href: string;
  expires_on: string;
}

// Dashboard card listing what a diver has to renew - certifications that have run out
// or are about to, and the dive insurance beside them, since a lapsed policy stops a
// dive at the desk exactly as a lapsed rescue card does.
//
// The gear twin of this is `ServiceDueCard`, and it follows the same rule: it renders
// **nothing at all** when nothing needs renewing (and when the fetch fails), because a
// permanent "your certifications are fine" tile is exactly the kind of dashboard filler
// that teaches people to stop reading the dashboard.
//
// Certification rows link to `/certifications` rather than to a card of their own -
// certifications are edited in dialogs on that one page, so there is no
// per-certification URL to send anyone to. The insurance row links to `/settings/checkin`,
// where the policy is entered.
//
// The API returns every dated certification with no horizon - a server-side "expiring
// within N days" filter would bake today's date into a cached response and go wrong at
// midnight - so the bucketing happens here, exactly as it does for gear, and the
// insurance goes through the same one.
export function CertificationExpiryCard() {
  const { user } = useAuth();
  const [certifications, setCertifications] = useState<
    CertificationExpiringEntry[]
  >([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    certificationsAPI
      .getExpiring()
      .then((response) => {
        if (cancelled) return;
        setCertifications(response.data);
        setTruncated(response.truncated === true);
      })
      // Swallowed on purpose, like `ServiceDueCard`: a supplementary card that failed to
      // load should leave the dashboard looking normal rather than showing an error tile.
      .catch((error) => console.error("Failed to load certifications:", error));

    return () => {
      cancelled = true;
    };
  }, []);

  const renewable: Renewable[] = certifications.map((certification) => ({
    key: certification.uuid,
    title: certification.name,
    detail: certificationAgencyLabel(
      certification.agency,
      certification.agency_other,
    ),
    href: "/certifications",
    expires_on: certification.expires_on,
  }));

  // A policy with a date on it and no provider named is still a policy running out,
  // so the row falls back to saying what it is.
  const provider = user?.insurance_provider?.trim();
  if (user?.insurance_expires_on) {
    renewable.push({
      key: "dive-insurance",
      title: provider || "Dive insurance",
      detail: provider ? "Dive insurance" : null,
      href: "/settings/checkin",
      expires_on: user.insurance_expires_on,
    });
  }

  // One list rather than a section each, so the soonest thing to run out is the first
  // line whichever kind it is - which is what `certificationRenewals` sorts for, and
  // why it is generic over anything carrying an `expires_on`.
  const flagged = certificationRenewals(renewable);

  if (flagged.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4" />
          Renewals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flagged.map(({ certification: row, status, expiresOn }) => (
          <Link
            key={row.key}
            href={row.href}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{row.title}</div>
              {row.detail && (
                <div className="text-xs text-muted-foreground">
                  {row.detail}
                </div>
              )}
            </div>
            {/* Detail first, then the chip, and one width for both chips - the same
                treatment as the service-due card directly above this one on the
                dashboard, for the same reason. These rows are `justify-between`, so
                a leading badge parks the coloured chip mid-row and leaves the grey
                date on the edge the rows align on. "Expiring soon" is the wider of
                the two labels; `min-w-28` clears it with room for a fallback font, and
                `whitespace-nowrap` keeps a chip that outgrows it one line tall. */}
            <div className="flex flex-wrap items-center gap-2">
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
      </CardContent>
    </Card>
  );
}
