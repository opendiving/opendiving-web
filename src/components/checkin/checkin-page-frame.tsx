"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, FileText, Pencil, Plus, Printer } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/hooks/useUnits";
import {
  certificationAgencyLabel,
  certificationFile,
  type Certification,
} from "@/lib/api/certifications";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import {
  hasDivingFigures,
  loggedDivingFigures,
  missingCheckInDetails,
  type DivingFigures,
} from "@/lib/checkin";
import { formatDateOnly } from "@/lib/date-time";
import { todayIsoDate } from "@/lib/gear-service";
import { formatDepth } from "@/lib/units";
import { CertificationCardImage } from "@/components/certifications/certification-card-image";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CheckInDetailsDialog } from "@/components/checkin/check-in-details-dialog";
import { DivingFiguresDialog } from "@/components/checkin/diving-figures-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTooltip } from "@/components/ui/tooltip";
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
  /** True when at least one of the three requests failed and its part is missing. */
  loadFailed?: boolean;
  onRetry?: () => void;
  /**
   * Re-reads the card list after one was added or edited here, so the summary keeps
   * `GET /certifications`' own order rather than an order this page invented.
   */
  onCertificationsChanged?: () => void;
}

const noop = () => {};

// Everything `/checkin` draws, rendered by the page and by the route fallback alike
// so the two cannot describe the screen differently. Every data-varying prop
// defaults to what the page holds on its first render, which is what the fallback
// passes: nothing.
export function CheckInPageFrame({
  certifications = [],
  stats = null,
  lastDiveAt = null,
  isLoading = true,
  loadFailed = false,
  onRetry = noop,
  onCertificationsChanged = noop,
}: CheckInPageFrameProps) {
  const { user } = useAuth();
  const units = useUnits();

  // The diver's own correction to the three diving figures, held for this visit and
  // nowhere else - see `DivingFiguresDialog` for why it is not saved.
  const [corrected, setCorrected] = useState<DivingFigures | null>(null);
  const [editing, setEditing] = useState<
    "details" | "diving" | "certification" | null
  >(null);
  const [editingCertification, setEditingCertification] =
    useState<Certification | null>(null);

  // Memoised because `DivingFiguresDialog` resets its form whenever this changes: a
  // fresh object each render would re-seed the boxes under the diver's keystrokes.
  const logged = useMemo(
    () => loggedDivingFigures(stats, lastDiveAt),
    [stats, lastDiveAt],
  );

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

  const diving = corrected ?? logged;
  const missingDetails = missingCheckInDetails(user);
  // Only once the list has actually landed: "add your first card" over a fetch still
  // in flight, or over one that failed, is the page inventing an emptiness.
  const hasNoCertifications =
    !isLoading && !loadFailed && certifications.length === 0;

  const openCertification = (certification: Certification | null) => {
    setEditingCertification(certification);
    setEditing("certification");
  };

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

      {/* On screen only: a sheet handed across a desk should not carry this app's
          troubles, but the diver about to print one has to know it is short. */}
      {loadFailed && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-destructive/40 px-4 py-3 print:hidden">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Some of this didn&rsquo;t load, so the summary below is
              incomplete.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {/* Above the sheet and `print:hidden`, for the reason `missingCheckInDetails`
          gives: a page that lists what its author left blank is the opposite of what
          this one is for. */}
      {(missingDetails.length > 0 || hasNoCertifications) && (
        <div className="space-y-3 rounded-md border border-dashed px-4 py-3 print:hidden">
          <p className="text-sm text-muted-foreground">
            Not on your summary yet:{" "}
            {[
              ...missingDetails,
              ...(hasNoCertifications ? ["certifications"] : []),
            ].join(", ")}
            . A desk usually asks for these &mdash; add what you want to hand
            over.
          </p>
          <div className="flex flex-wrap gap-2">
            {missingDetails.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing("details")}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Fill in details
              </Button>
            )}
            {hasNoCertifications && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCertification(null)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add a certification
              </Button>
            )}
          </div>
        </div>
      )}

      <Card
        className={`print:border-0 print:shadow-none print:bg-white ${INK}`}
      >
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-4">
            {/* Only a picture the diver actually stored. The initials Radix falls
                back to are a placeholder for a face on screen; printed at the top of
                a sheet handed to a stranger they are a monogram nobody chose, and a
                bare name reads better than a circle with "SR" in it. */}
            {user.avatar_sha256 && (
              <UserAvatar
                name={user.name}
                avatarSha={user.avatar_sha256}
                size={64}
              />
            )}
            <h2 className={`text-2xl font-semibold ${INK}`}>{user.name}</h2>
            <div className="ml-auto print:hidden">
              <IconTooltip label="Edit check-in details">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing("details")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </div>
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
            <Section
              title="Certifications"
              busy={isLoading}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openCertification(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              }
            >
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
                  {/* The list endpoint's own order, taken as it arrives rather
                      than re-imposed here: `GET /certifications` sorts by
                      `certified_on` descending with nulls last, tie-broken by
                      uuid, so the card a diver is most often asked to show leads.
                      Sorting again here could only disagree with
                      `/certifications`. */}
                  {certifications.map((certification) => (
                    <CertificationSummary
                      key={certification.uuid}
                      certification={certification}
                      onEdit={() => openCertification(certification)}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* A failed stats fetch leaves the profile half of this page correct and
              this section with nothing to say, so it goes rather than heading an
              empty list. */}
          {(isLoading || hasDivingFigures(diving)) && (
            <Section
              title="Diving"
              busy={isLoading}
              action={
                <IconTooltip label="Correct these figures">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing("diving")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </IconTooltip>
              }
            >
              <DetailList>
                <Detail
                  label="Dives logged"
                  value={
                    diving.totalDives !== null
                      ? String(diving.totalDives)
                      : null
                  }
                  pending={isLoading && !stats}
                />
                <Detail
                  label="Max depth"
                  value={
                    diving.maxDepth !== null
                      ? formatDepth(diving.maxDepth, units)
                      : null
                  }
                  pending={isLoading && !stats}
                />
                <Detail
                  label="Last dive"
                  value={diving.lastDiveOn && formatDateOnly(diving.lastDiveOn)}
                  pending={isLoading && !lastDiveAt}
                />
              </DetailList>
              {corrected && (
                <p className="text-xs text-muted-foreground print:hidden">
                  Corrected for this summary. Nothing was saved to your log.
                </p>
              )}
            </Section>
          )}

          <p className={`text-xs text-muted-foreground ${INK}`}>
            Printed {formatDateOnly(todayIsoDate())} from {user.name}&rsquo;s
            own dive log. These are entries this diver made; a certification is
            verified with the agency that issued it, not here.
          </p>
        </CardContent>
      </Card>

      {/* One instance of each, hosted here rather than reached through
          `useQuickCreate`: that provider's certification dialog navigates to
          `/certifications` on save, and a diver correcting a card at a desk wants
          the summary they were about to print, not another page. */}
      <CheckInDetailsDialog
        open={editing === "details"}
        onOpenChange={(open) => setEditing(open ? "details" : null)}
      />
      <DivingFiguresDialog
        open={editing === "diving"}
        onOpenChange={(open) => setEditing(open ? "diving" : null)}
        logged={logged}
        corrected={corrected}
        onChange={setCorrected}
      />
      <CertificationDialog
        open={editing === "certification"}
        onOpenChange={(open) => setEditing(open ? "certification" : null)}
        certification={editingCertification}
        onSaved={onCertificationsChanged}
      />
    </div>
  );
}

// One certification as the desk reads it: the agency in words, the level, and the
// numbers under it, beside the front of the card where the diver stored one.
function CertificationSummary({
  certification,
  onEdit,
}: {
  certification: Certification;
  onEdit: () => void;
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
        <div className="flex items-start gap-2">
          <div className={`flex-1 font-medium ${INK}`}>
            {agency ? `${agency} ${certification.name}` : certification.name}
          </div>
          <div className="print:hidden">
            <IconTooltip label={`Edit ${certification.name}`}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-my-1"
                onClick={onEdit}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </div>
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
  action,
  children,
}: {
  title: string;
  busy?: boolean;
  /** The control this section is edited through. On screen only. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-busy={busy || undefined} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3
          className={`text-sm font-semibold uppercase tracking-wide ${MUTED}`}
        >
          {title}
        </h3>
        {action && <div className="print:hidden">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// Labels down one column and values down the other, rather than each pair running
// inline: a desk reads this by scanning for the value it was asked for, and a ragged
// left edge on the values is what makes that a search rather than a glance.
//
// `Detail` renders its `<dt>` and `<dd>` as a fragment so both are direct children of
// this grid; wrapping each pair in a `<div>` would put the pair in one cell and take
// the alignment back.
function DetailList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
      {children}
    </dl>
  );
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
    <>
      <dt className={MUTED}>{label}</dt>
      <dd className={`text-sm font-medium ${INK}`}>
        {value ?? <Skeleton className="h-4 w-16" />}
      </dd>
    </>
  );
}
