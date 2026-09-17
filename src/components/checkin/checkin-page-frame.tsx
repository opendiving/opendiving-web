"use client";

import { type ReactNode } from "react";
import { FileText, Printer } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/hooks/useUnits";
import {
  certificationAgencyLabel,
  certificationFile,
  type Certification,
} from "@/lib/api/certifications";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import { formatDateOnly, formatDiveDateTime } from "@/lib/date-time";
import { todayIsoDate } from "@/lib/gear-service";
import { formatDepth } from "@/lib/units";
import { CertificationCardImage } from "@/components/certifications/certification-card-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";

// A printed page comes off a browser with background colours dropped and text
// colours kept, so a summary printed from the dark theme would be near-white ink on
// white paper. Every string that carries a colour is forced black in print media;
// there is no `@media print` block anywhere in this app, and this is why there does
// not need to be one.
const INK = "print:text-black";
const MUTED = `text-sm text-muted-foreground ${INK}`;

export interface CheckInPageFrameProps {
  /** Every card the diver holds, in the list endpoint's own order. */
  certifications?: Certification[];
  /** Null while the stats request is in flight. */
  stats?: UserDiveStats | null;
  /** The most recent dive's `start_time`, or null when there is no dive. */
  lastDiveAt?: string | null;
  /** True until the certifications, the stats and the last dive have all landed. */
  isLoading?: boolean;
}

// Everything `/checkin` draws, rendered by the page and by the route fallback alike
// so the two cannot describe the screen differently. Every data-varying prop
// defaults to what the page holds on its first render, which is what the fallback
// passes: nothing.
export function CheckInPageFrame({
  certifications = [],
  stats = null,
  lastDiveAt = null,
  isLoading = true,
}: CheckInPageFrameProps) {
  const { user } = useAuth();
  const units = useUnits();

  // Read from the auth context rather than a prop, so the page and its fallback read
  // one source and the name cannot differ between them. It is also what keeps the
  // print date below off the server: `user` is null until the auth check settles in
  // an effect, so this component never renders server-side and there is nothing for
  // hydration to disagree about.
  if (!user) return null;

  const hasEmergencyContact =
    !!user.emergency_contact_name ||
    !!user.emergency_contact_phone ||
    !!user.emergency_contact_relationship;
  const hasInsurance =
    !!user.insurance_provider ||
    !!user.insurance_policy_number ||
    !!user.insurance_expires_on;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-bold ${INK}`}>Check-in</h1>
          <p className="text-muted-foreground mt-2 print:hidden">
            What a dive shop asks for at the desk, on one page you can hand over
          </p>
        </div>
        {/* The browser's own print, which is also its save-as-PDF: no generator in
            either repo, and nothing is uploaded to produce it. */}
        <Button
          type="button"
          onClick={() => window.print()}
          className="print:hidden"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>

      <p className="text-sm text-muted-foreground print:hidden">
        Your browser&rsquo;s print dialog can save this as a PDF too &mdash;
        worth keeping on your phone for a desk with no signal.
      </p>

      <Card
        className={`print:border-0 print:shadow-none print:bg-white ${INK}`}
      >
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              name={user.name}
              avatarSha={user.avatar_sha256}
              size={64}
            />
            <h2 className={`text-2xl font-semibold ${INK}`}>{user.name}</h2>
          </div>

          {/* Guarded rather than left to render an empty list: this stack spaces
              its children, so a `<dl>` with nothing in it is 24px of blank page
              above whatever comes next. Every group below is guarded for the same
              reason. */}
          {(user.date_of_birth || user.phone) && (
            <DetailList>
              <Detail
                label="Date of birth"
                value={user.date_of_birth && formatDateOnly(user.date_of_birth)}
              />
              <Detail label="Phone" value={user.phone} />
            </DetailList>
          )}

          {hasEmergencyContact && (
            <Section title="Emergency contact">
              <DetailList>
                <Detail label="Name" value={user.emergency_contact_name} />
                <Detail label="Phone" value={user.emergency_contact_phone} />
                <Detail
                  label="Relationship"
                  value={user.emergency_contact_relationship}
                />
              </DetailList>
            </Section>
          )}

          {hasInsurance && (
            <Section title="Dive insurance">
              <DetailList>
                <Detail label="Provider" value={user.insurance_provider} />
                <Detail
                  label="Policy number"
                  value={user.insurance_policy_number}
                />
                <Detail
                  label="Expires"
                  value={
                    user.insurance_expires_on &&
                    formatDateOnly(user.insurance_expires_on)
                  }
                />
              </DetailList>
            </Section>
          )}

          {(isLoading || certifications.length > 0) && (
            <Section title="Certifications" busy={isLoading}>
              {isLoading ? (
                <div aria-hidden className="space-y-4">
                  {[0, 1].map((row) => (
                    <div key={row} className="flex gap-4">
                      <Skeleton className="h-16 w-24 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* The list endpoint's own order, which is what "newest first"
                      means everywhere else in this app: most recently entered at
                      the top. Re-sorting by the date on the card would disagree
                      with `/certifications` for no gain a desk can see. */}
                  {certifications.map((certification) => (
                    <CertificationSummary
                      key={certification.uuid}
                      certification={certification}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* A failed stats fetch leaves the profile half of this page correct and
              this section with nothing to say, so it goes rather than heading an
              empty list. */}
          {(isLoading || stats || lastDiveAt) && (
            <Section title="Diving" busy={isLoading}>
              <DetailList>
                <Detail
                  label="Dives logged"
                  value={stats && String(stats.total_dives)}
                  pending={isLoading && !stats}
                />
                <Detail
                  label="Max depth"
                  value={stats && formatDepth(stats.max_depth, units)}
                  pending={isLoading && !stats}
                />
                <Detail
                  label="Last dive"
                  value={
                    lastDiveAt &&
                    formatDiveDateTime(lastDiveAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  }
                  pending={isLoading && !lastDiveAt}
                />
              </DetailList>
            </Section>
          )}

          <p className={`text-xs text-muted-foreground ${INK}`}>
            Printed {formatDateOnly(todayIsoDate())} from {user.name}&rsquo;s
            own dive log. These are entries this diver made; a certification is
            verified with the agency that issued it, not here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// One certification as the desk reads it: the agency in words, the level, and the
// numbers under it, beside the front of the card where the diver stored one.
function CertificationSummary({
  certification,
}: {
  certification: Certification;
}) {
  const front = certificationFile(certification, "front");
  const isPdf = front?.content_type === "application/pdf";
  const agency = certificationAgencyLabel(
    certification.agency,
    certification.agency_other,
  );

  return (
    // Keeps a card off a page boundary: the alternative is a printed summary whose
    // last certification is cut in half, which is the one thing a desk cannot read.
    <div className="flex gap-4 break-inside-avoid">
      {isPdf ? (
        <div
          className={`flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-muted px-1 text-center text-muted-foreground print:bg-white ${INK}`}
        >
          <FileText className="h-4 w-4" aria-hidden />
          <span className="text-[10px] leading-tight">card on file as PDF</span>
        </div>
      ) : (
        front && (
          <CertificationCardImage
            certificationUuid={certification.uuid}
            side="front"
            file={front}
            compact
            className="h-16 w-24 shrink-0"
          />
        )
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className={`font-medium ${INK}`}>
          {agency ? `${agency} ${certification.name}` : certification.name}
        </div>
        <DetailList>
          <Detail label="Number" value={certification.certification_number} />
          <Detail
            label="Certified"
            value={
              certification.certified_on &&
              formatDateOnly(certification.certified_on)
            }
          />
          <Detail
            label="Expires"
            value={
              certification.expires_on &&
              formatDateOnly(certification.expires_on)
            }
          />
          <Detail label="Instructor" value={certification.instructor_name} />
          <Detail
            label="Training centre"
            value={certification.training_center}
          />
        </DetailList>
      </div>
    </div>
  );
}

function Section({
  title,
  busy = false,
  children,
}: {
  title: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-busy={busy || undefined} className="space-y-2">
      <h3 className={`text-sm font-semibold uppercase tracking-wide ${MUTED}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailList({ children }: { children: ReactNode }) {
  return <dl className="space-y-1">{children}</dl>;
}

// A field the diver has not filled in is absent, never a labelled blank: this is a
// page somebody hands to a stranger, and an empty "Insurance policy number:" line
// reads as a thing withheld rather than a thing not held.
//
// `pending` is the one exception, and only while the request that would fill it is
// still in flight - a placeholder there holds the line's height instead of letting
// the summary grow under the reader.
function Detail({
  label,
  value,
  pending = false,
}: {
  label: string;
  value?: string | null;
  pending?: boolean;
}) {
  if (!value && !pending) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className={MUTED}>{label}</dt>
      <dd className={`text-sm font-medium ${INK}`}>
        {value ?? <Skeleton className="h-4 w-16" />}
      </dd>
    </div>
  );
}
