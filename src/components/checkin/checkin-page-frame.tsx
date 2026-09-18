"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, FileText, Printer, SquarePen } from "lucide-react";

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
  type DivingFigures,
} from "@/lib/checkin";
import { formatDateOnly } from "@/lib/date-time";
import { todayIsoDate } from "@/lib/gear-service";
import { formatDepth } from "@/lib/units";
import {
  ABOUT_YOU_FIELDS,
  EMERGENCY_CONTACT_FIELDS,
  INSURANCE_FIELDS,
} from "@/lib/validations/user-fields";
import { cn } from "@/lib/utils";
import { CertificationCardImage } from "@/components/certifications/certification-card-image";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { DivingFiguresDialog } from "@/components/checkin/diving-figures-dialog";
import { UserFieldsDialog } from "@/components/user/user-fields-dialog";
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

// A card image is the only thing on this sheet that is not a line of text, so it gets
// a column of its own on the left and every line starts clear of it. `SLOT` is that
// column - held even where there is no picture, so the text below a diver's avatar
// and the text beside a c-card start at the same place - and `GUTTER` is the same
// width plus the gap, for the blocks that have no image to put in it.
//
// Each carries a `print:` twin of its `sm:` value. Tailwind's `sm:` is a min-width
// query, and under print media the width is the paper's - so a narrow sheet, or a
// browser scaling one down, would otherwise drop the whole column to its phone size
// on paper alone, and only half of what has to line up would move.
const SLOT = "w-16 shrink-0 sm:w-24 print:w-24";
const GUTTER = "ml-20 sm:ml-28 print:ml-28";
// A card row lives inside a section that already carries `GUTTER`, and hangs its own
// image back out into it.
const NEGATIVE_GUTTER = "-ml-20 sm:-ml-28 print:-ml-28";

// The page header is outside the card, so on paper - where it is the only thing above
// the sheet that still prints - landing on the sheet's own left edge means clearing
// `CardContent`'s `p-6` as well as `GUTTER`: 1.5rem + 7rem. On screen it stays where
// every other page's heading is, at the page's edge.
const PRINTED_HEADER_GUTTER = "print:ml-[8.5rem]";

// What a page break may not fall inside. Each of these is read as one thing - an
// emergency contact split over a fold is a name on one sheet and the number to ring
// on another. The Certifications *section* is deliberately not one of them: a diver
// with a handful of cards is taller than a page, and `break-inside: avoid` on
// something that cannot fit only moves the break to the top and wastes the page. Its
// unit is the individual card, which carries this itself.
const KEEP_TOGETHER = "break-inside-avoid";

/**
 * What the browser offers as the filename when this page is saved as a PDF.
 *
 * There is no API for it: the name comes from `document.title` at the moment the
 * print dialog opens, and the tab's own title is the site's. So the swap happens on
 * `beforeprint` and is undone on `afterprint` - which also means Cmd+P gets the same
 * name as the Print button, rather than only the route the button takes.
 *
 * The date is ISO so a diver's saved sheets sort chronologically in a folder, and the
 * separators a filesystem would choke on are replaced rather than left to the
 * browser - a name is a diver's own text and may hold anything.
 */
function printedFileName(name: string): string {
  return `${name} - diver check-in - ${todayIsoDate()}`.replace(
    /[/\\:*?"<>|]/g,
    "-",
  );
}

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
   * Re-reads the card list after one was edited here, so the summary keeps
   * `GET /certifications`' own order rather than an order this page invented.
   * Editing is all this page offers - a card is added where cards are kept.
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
  // One at a time, and named for the section it sits in: each control opens exactly
  // the group it is beside.
  const [editing, setEditing] = useState<
    "about" | "insurance" | "emergency" | "diving" | "certification" | null
  >(null);
  const [editingCertification, setEditingCertification] =
    useState<Certification | null>(null);

  // A plain effect on purpose, unlike every form reset in the app: this one only
  // registers listeners, and its cleanup removes them. `useEffectOnChange` would drop
  // them when the route is hidden and skip re-adding them when it comes back, so the
  // filename would quietly stop working after a diver navigated away and returned.
  const printedTitle = user ? printedFileName(user.name) : null;
  useEffect(() => {
    if (!printedTitle) return;

    let previous: string | null = null;
    const before = () => {
      previous = document.title;
      document.title = printedTitle;
    };
    const after = () => {
      if (previous !== null) document.title = previous;
      previous = null;
    };

    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [printedTitle]);

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

  const hasAboutYou = !!user.date_of_birth || !!user.phone;
  const diving = corrected ?? logged;
  const hasFigures = isLoading || hasDivingFigures(diving);

  const openCertification = (certification: Certification) => {
    setEditingCertification(certification);
    setEditing("certification");
  };

  // `print:pb-0` on the wrapper: the bottom padding is breathing room on a screen and
  // dead space on paper, where the printer's own margin already sits below it - and
  // 32px of it is enough to push a sheet that fits onto a second page.
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 print:pb-0">
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4",
          PRINTED_HEADER_GUTTER,
        )}
      >
        <div>
          {/* "Diver" earns its place on the printed sheet rather than on screen:
              the line under this one is `print:hidden`, so the heading is the only
              thing naming the document a shop is handed, and "Check-in" alone above
              a stranger's name and card numbers leaves them to infer what it is. The
              account menu stays "Check-in" - there the reader is the diver, and
              "Diver" would be telling them whose page it is. */}
          <h1 className={`text-3xl font-bold ${INK}`}>Diver Check-in</h1>
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

      <Card
        className={`print:border-0 print:shadow-none print:bg-white ${INK}`}
      >
        <CardContent className="pt-6 space-y-6">
          {/* The same shape a certification row has: the picture in the image
              column, and the name and its two rows in one column beside it. That is
              what makes the name read as this block's heading and puts the gap under
              it on the sheet's own rhythm - the name centred against a 64px avatar
              instead would sit 8px further off its rows than any section heading
              does. */}
          <div className={cn("flex gap-4", KEEP_TOGETHER)}>
            {/* Only a picture the diver actually stored. The initials Radix falls
                back to are a placeholder for a face on screen; printed at the top of
                a sheet handed to a stranger they are a monogram nobody chose, and a
                bare name reads better than a circle with "SR" in it. The slot stays
                either way, so the name sits over the c-cards' own column - centred in
                it, the avatar being narrower than a card and everything else in that
                column being one. */}
            <div className={cn(SLOT, "flex justify-center")}>
              {user.avatar_sha256 && (
                <UserAvatar
                  name={user.name}
                  avatarSha={user.avatar_sha256}
                  size={64}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              {/* `-my-1` pulls the control's margin box inside the name's line, as a
                  certification row does with its own: left to set the row height the
                  button is taller than the text, and the gap under the name would
                  come out short of every section's by those two pixels. */}
              <div className="flex items-center gap-2">
                <h2 className={`flex-1 text-2xl font-semibold ${INK}`}>
                  {user.name}
                </h2>
                <EditControl
                  className="-my-1"
                  label="Edit your name, date of birth and phone number"
                  onClick={() => setEditing("about")}
                />
              </div>

              {/* Always on screen, so the control beside the name is always there,
                  and dropped from the print when it holds nothing: a `<dl>` with
                  every row absent is blank page on a sheet handed to somebody. */}
              <div className={cn(!hasAboutYou && "print:hidden")}>
                {hasAboutYou ? (
                  <DetailList>
                    <Detail
                      label="Date of birth"
                      value={
                        user.date_of_birth && formatDateOnly(user.date_of_birth)
                      }
                    />
                    <Detail label="Phone" value={user.phone} />
                  </DetailList>
                ) : (
                  <EmptyNote>Not filled in yet.</EmptyNote>
                )}
              </div>
            </div>
          </div>

          <Section
            title="Certifications"
            busy={isLoading}
            className={cn(
              GUTTER,
              !isLoading && certifications.length === 0 && "print:hidden",
            )}
          >
            {isLoading ? (
              // Same geometry as `CertificationSummary`, down to the `SLOT` and the
              // `NEGATIVE_GUTTER` that hangs the image back out of the section's
              // indent: a placeholder that sits where its row will not is a list that
              // jumps left and resizes the moment the fetch lands.
              <div aria-hidden className="space-y-4">
                {[0, 1].map((row) => (
                  <div key={row} className={cn("flex gap-4", NEGATIVE_GUTTER)}>
                    <Skeleton className={cn(SLOT, "h-12 sm:h-16 print:h-16")} />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : certifications.length === 0 ? (
              // Silent rather than "No certifications yet." when the list never
              // arrived: an empty array is what a rejected fetch leaves behind too,
              // and telling a diver who holds six cards that they hold none is the
              // page inventing a fact about the account out of a network failure.
              // The banner above already says what happened and offers the retry.
              !loadFailed && <EmptyNote>No certifications yet.</EmptyNote>
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

          <Section
            title="Diving"
            busy={isLoading}
            // A diver who cleared every figure has said to leave the diving off the
            // sheet, and the sheet obeys - heading and all. The section stays on
            // screen regardless, because the control that emptied it is the only
            // way back to "Use logged figures", and a section that removed itself
            // would leave a correction in force with nothing on screen saying so.
            className={cn(GUTTER, KEEP_TOGETHER, !hasFigures && "print:hidden")}
            action={
              <EditControl
                label="Correct these figures"
                onClick={() => setEditing("diving")}
              />
            }
          >
            {hasFigures && (
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
            )}
            {/* Two states are empty here without being unfilled, and neither is
                visible from `hasFigures` alone: a rejected `/user/dive-stats` leaves
                `stats` null, and a diver who cleared all three boxes leaves a
                `corrected` whose every field is null. The second would otherwise
                read "Not filled in yet." directly above "Corrected for this
                summary", which is the page contradicting itself to the one diver who
                knows better. */}
            {!hasFigures && !loadFailed && !corrected && (
              <EmptyNote>Not filled in yet.</EmptyNote>
            )}
            {corrected && (
              <p className="text-xs text-muted-foreground print:hidden">
                Corrected for this summary. Nothing was saved to your log.
              </p>
            )}
          </Section>

          {/* Insurance and the emergency contact come after the diving rather than
              before it: a desk works down what the diver is certified to do and what
              they have actually dived, and reaches for the policy to quote and the
              person to call only if something goes wrong. */}
          <Section
            title="Dive insurance"
            className={cn(
              GUTTER,
              KEEP_TOGETHER,
              !hasInsurance && "print:hidden",
            )}
            action={
              <EditControl
                label="Edit your dive insurance"
                onClick={() => setEditing("insurance")}
              />
            }
          >
            {hasInsurance ? (
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
            ) : (
              <EmptyNote>Not filled in yet.</EmptyNote>
            )}
          </Section>

          <Section
            title="Emergency contact"
            className={cn(
              GUTTER,
              KEEP_TOGETHER,
              !hasEmergencyContact && "print:hidden",
            )}
            action={
              <EditControl
                label="Edit your emergency contact"
                onClick={() => setEditing("emergency")}
              />
            }
          >
            {hasEmergencyContact ? (
              <DetailList>
                <Detail label="Name" value={user.emergency_contact_name} />
                <Detail label="Phone" value={user.emergency_contact_phone} />
                <Detail
                  label="Relationship"
                  value={user.emergency_contact_relationship}
                />
              </DetailList>
            ) : (
              <EmptyNote>Not filled in yet.</EmptyNote>
            )}
          </Section>

          <p
            className={cn(
              "text-xs text-muted-foreground",
              INK,
              GUTTER,
              KEEP_TOGETHER,
            )}
          >
            Printed {formatDateOnly(todayIsoDate())} from {user.name}&rsquo;s
            own dive log. These are entries this diver made; a certification is
            verified with the agency that issued it, not here.
          </p>
        </CardContent>
      </Card>

      {/* One instance of each, hosted here rather than reached through
          `useQuickCreate`: that provider's certification dialog navigates to
          `/certifications` on save, and a diver correcting a card at a desk wants
          the summary they were about to print, not another page. Correcting is all
          this page offers - a card is added where cards are kept. */}
      <UserFieldsDialog
        open={editing === "about"}
        onOpenChange={(open) => setEditing(open ? "about" : null)}
        title="About you"
        description="Your own details, as a desk asks for them."
        groups={[{ fields: ["name", ...ABOUT_YOU_FIELDS] }]}
      />
      <UserFieldsDialog
        open={editing === "insurance"}
        onOpenChange={(open) => setEditing(open ? "insurance" : null)}
        title="Dive insurance"
        description="The provider and policy number a shop takes down, and when the cover runs out."
        groups={[{ fields: [...INSURANCE_FIELDS] }]}
      />
      <UserFieldsDialog
        open={editing === "emergency"}
        onOpenChange={(open) => setEditing(open ? "emergency" : null)}
        title="Emergency contact"
        description="Who a shop calls if something goes wrong, and how they know you."
        groups={[{ fields: [...EMERGENCY_CONTACT_FIELDS] }]}
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
    <div className={cn("flex gap-4 break-inside-avoid", NEGATIVE_GUTTER)}>
      {isPdf ? (
        <div
          className={cn(
            SLOT,
            "flex h-12 flex-col items-center justify-center gap-1 rounded-md border bg-muted px-1 text-center text-muted-foreground sm:h-16 print:h-16 print:bg-white",
            INK,
          )}
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
            className={cn(SLOT, "h-12 sm:h-16 print:h-16")}
          />
        )
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <div className={`flex-1 font-medium ${INK}`}>
            {agency ? `${agency} ${certification.name}` : certification.name}
          </div>
          <EditControl
            label={`Edit ${certification.name}`}
            className="-my-1"
            onClick={onEdit}
          />
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

// Every section's edit control, and the one on the name row: an icon button whose
// hover hint is also its accessible name, and which never reaches the page a diver
// hands over.
function EditControl({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div className="print:hidden">
      <IconTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          onClick={onClick}
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </IconTooltip>
    </div>
  );
}

// What a section with nothing in it says on screen. It never prints: the section
// around it is already dropped from the page when it is showing this, and a sheet
// that announced its own gaps is the opposite of what a diver hands over.
function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={`${MUTED} print:hidden`}>{children}</p>;
}

function Section({
  title,
  busy = false,
  action,
  className,
  children,
}: {
  title: string;
  busy?: boolean;
  /** The control this section is edited through. On screen only. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-busy={busy || undefined}
      className={cn("space-y-2", className)}
    >
      {/* A heading stranded at the foot of a page, with its rows over the fold, is
          the one break a reader has to work around. */}
      <div className="flex items-center justify-between gap-2 break-after-avoid">
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
// The floor on the label track is what lines the *sections* up too, each being a list
// of its own: a track sized purely by content puts "Provider" and "Name" in columns
// 14px apart. It lifts from `sm` because the narrowest case is a card's details beside
// its 96px thumbnail on a phone, where a fixed 8rem of label would leave the training
// centre wrapping in what is left.
//
// `Detail` renders its `<dt>` and `<dd>` as a fragment so both are direct children of
// this grid; wrapping each pair in a `<div>` would put the pair in one cell and take
// the alignment back.
function DetailList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[minmax(8rem,auto)_1fr] print:grid-cols-[minmax(8rem,auto)_1fr]">
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
