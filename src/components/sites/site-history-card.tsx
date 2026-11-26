"use client";

import { useEffect, useState, type ReactNode } from "react";
import { History as HistoryIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SHARED_MEMBER_ROWS } from "@/components/sites/shared-member-rows";
import { useUnits } from "@/hooks/useUnits";
import { adminAPI, type AdminDiveSiteHistoryEntry } from "@/lib/api/admin";
import { fetchAllPages, isAbortError } from "@/lib/api/client";
import {
  diveSitesAPI,
  type DiveSiteHistoryDetail,
  type DiveSiteHistoryEntry,
  type DiveSiteSharedMembers,
} from "@/lib/api/dive-sites";
import { formatDateTime } from "@/lib/date-time";
import { formatDistance, haversineMeters } from "@/lib/geo-distance";
import type { UnitSelection } from "@/lib/units";

// A diver reads the entry; a reviewer also reads who it came from and how it was
// reviewed, which the admin read alone carries.
type HistoryEntry = DiveSiteHistoryEntry &
  Partial<
    Pick<
      AdminDiveSiteHistoryEntry,
      "show_proposer" | "reviewed_by" | "corrected"
    >
  >;

const KIND_LABELS: Record<DiveSiteHistoryEntry["kind"], string> = {
  added: "Added",
  changed: "Changed",
};

const NOT_RECORDED = "Not recorded";
const PIN = ["latitude", "longitude"];

interface DetailLine {
  label: string;
  value: ReactNode;
}

// A value this build has no formatter for, as the API sent it.
const raw = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

function change(before: ReactNode, after: ReactNode) {
  return (
    <>
      {before || NOT_RECORDED} &rarr; {after || NOT_RECORDED}
    </>
  );
}

// Each detail as a label and its old and new value, through the rows the review and
// the propose dialog format shared members with. The pin's two coordinates are one
// line, saying how far it moved.
function detailLines(
  details: DiveSiteHistoryDetail[],
  units: UnitSelection,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const pin = details.filter((detail) => PIN.includes(detail.field));
  for (const detail of details) {
    const row = SHARED_MEMBER_ROWS.find((candidate) =>
      candidate.keys.includes(detail.field as keyof DiveSiteSharedMembers),
    );
    if (!row) {
      lines.push({
        label: detail.field,
        value: change(raw(detail.old), raw(detail.new)),
      });
      continue;
    }
    if (PIN.includes(detail.field)) {
      if (detail !== pin[0]) continue;
      const side = (which: "old" | "new") =>
        Object.fromEntries(pin.map((part) => [part.field, part[which]]));
      const before = side("old");
      const after = side("new");
      const isPoint = (point: Record<string, unknown>) =>
        PIN.every((coordinate) => typeof point[coordinate] === "number");
      lines.push({
        label: row.label,
        value:
          isPoint(before) && isPoint(after)
            ? `Moved ${formatDistance(
                haversineMeters(
                  before as { latitude: number; longitude: number },
                  after as { latitude: number; longitude: number },
                ),
                units,
              )}`
            : change(
                row.show(before as unknown as DiveSiteSharedMembers, units),
                row.show(after as unknown as DiveSiteSharedMembers, units),
              ),
      });
      continue;
    }
    const show = (value: unknown) =>
      row.show(
        { [detail.field]: value } as unknown as DiveSiteSharedMembers,
        units,
      );
    lines.push({
      label: row.label,
      value: change(show(detail.old), show(detail.new)),
    });
  }
  return lines;
}

// What a reviewer reads of a diver's entry, and of nothing else: `corrected` is a
// boolean on a diver's entry and null on a correction, whichever names are set.
function reviewerLines(entry: HistoryEntry): string[] | null {
  if (entry.corrected == null) return null;
  return [
    entry.show_proposer == null
      ? "The proposal has gone with its account."
      : entry.show_proposer
        ? "Their name is shown to other divers."
        : "Their name is not shown to other divers.",
    entry.reviewed_by
      ? `Reviewed by ${entry.reviewed_by}.`
      : "Reviewed by an account since deleted.",
    entry.corrected
      ? "The review corrected it, as the entry above lists."
      : "Accepted as proposed.",
  ];
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const { preferences: units } = useUnits();
  const lines = detailLines(entry.details, units);
  const review = reviewerLines(entry);
  return (
    <li className="min-w-0 space-y-1 py-3 first:pt-0 last:pb-0">
      <p className="break-words">
        <span className="font-medium">
          {KIND_LABELS[entry.kind] ?? entry.kind}
          {entry.made_by && ` by ${entry.made_by}`}
        </span>{" "}
        <span className="text-muted-foreground">
          &middot;{" "}
          {formatDateTime(entry.created_at, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </p>
      {lines.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {review && (
        <ul className="text-muted-foreground">
          {review.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface SiteHistoryCardProps {
  siteUuid: string;
  // A superuser's card reads the admin history, which names every proposer.
  asReviewer: boolean;
}

/**
 * A Commons record's history, newest first: what each accepted proposal added or
 * changed, and when, with the name of who made it where one is shown. Read whole, as
 * the species card reads its list. Nothing is drawn while it loads, for a record
 * with no entry, or when the read fails: the page around it stands either way.
 */
export function SiteHistoryCard({
  siteUuid,
  asReviewer,
}: SiteHistoryCardProps) {
  // Kept with the read it answers, so another site's list is never drawn here.
  const key = `${asReviewer}:${siteUuid}`;
  const [read, setRead] = useState<{
    key: string;
    entries: HistoryEntry[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAllPages<HistoryEntry>(
      (page, perPage) =>
        asReviewer
          ? adminAPI.getDiveSiteHistory(siteUuid, page, perPage)
          : diveSitesAPI.getDiveSiteHistory(siteUuid, page, perPage),
      {
        signal: controller.signal,
        label: "history entries",
        keyOf: (entry) => entry.uuid,
      },
    )
      .then((entries) => setRead({ key, entries }))
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        console.error("Failed to read the site's history:", error);
      });
    return () => controller.abort();
  }, [key, siteUuid, asReviewer]);

  const entries = read?.key === key ? read.entries : [];
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <HistoryIcon className="h-5 w-5" />
          History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {entries.map((entry) => (
            <HistoryItem key={entry.uuid} entry={entry} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
