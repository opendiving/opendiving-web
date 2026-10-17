"use client";

import type { CheckinLinkControls } from "@/hooks/useCheckinLink";
import { formatDateTime } from "@/lib/date-time";
import { QrCode } from "@/components/checkin/qr-code";
import { Button } from "@/components/ui/button";
import { LinkAddressField } from "@/components/ui/link-address-field";

// The live link, on screen only. A link made in this visit comes with its QR code and
// address; one found on a later visit has neither, the API having kept only a hash.
export function CheckInLinkPanel({
  sharing,
}: {
  sharing: CheckinLinkControls;
}) {
  const { live } = sharing;
  if (!live) return null;

  const expires = formatDateTime(live.expiresAt);
  const url = live.url;

  return (
    <section
      aria-label="Check-in link"
      className="flex flex-col gap-4 rounded-md border px-4 py-4 sm:flex-row print:hidden"
    >
      {url && (
        <QrCode
          value={url}
          label="QR code of the check-in link"
          className="h-44 w-44 shrink-0 self-center sm:self-start"
        />
      )}
      <div className="min-w-0 flex-1 space-y-3">
        {url ? (
          <p className="text-sm">
            Anyone with this link sees this page as it prints, until {expires}.
          </p>
        ) : (
          <>
            <p className="text-sm">
              A link to this page works until {expires}.
            </p>
            <p className="text-sm text-muted-foreground">
              Its address can&rsquo;t be shown again, because only a fingerprint
              of it is kept &mdash; Share makes a new link and retires this one.
            </p>
          </>
        )}
        {url && (
          <LinkAddressField
            url={url}
            label="Link address"
            what="check-in link"
          />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => void sharing.revoke()}
          disabled={sharing.busy}
        >
          Revoke
        </Button>
      </div>
    </section>
  );
}
