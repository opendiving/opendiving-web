"use client";

import { useState } from "react";
import {
  Download,
  FileArchive,
  FileCode,
  HardDriveDownload,
  Sheet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { exportAPI, type ExportFormat } from "@/lib/api/export";
import { getApiErrorMessage } from "@/lib/api/error";
import { downloadBlob } from "@/lib/download";

interface ExportRow {
  format: ExportFormat;
  icon: LucideIcon;
  title: string;
  description: string;
}

// One sentence per row, and each says what is *in* the file rather than what the format
// is - a diver choosing between three downloads is asking "which one has my stuff in
// it". Only the archive can answer "all of it", which is also why it is the row that
// mentions the certification scans: that is the one thing here worth knowing *before*
// the file lands in a downloads folder, not after.
const EXPORT_ROWS: ExportRow[] = [
  {
    format: "uddf",
    icon: FileCode,
    title: "UDDF",
    description:
      "Every dive with its sites, trips, gases, cylinders, gear and full sample profile, in the open format Subsurface, MacDive and divelogs.de import. This is the file to hand another program — gear sets, service history and your c-cards have no slot in it, and ride in the archive instead.",
  },
  {
    format: "csv",
    icon: Sheet,
    title: "Spreadsheet",
    description:
      "One row per dive, flattened for Excel, Numbers or a notebook. The normalized set — cylinders, trips, sites, gear, service history, certifications — ships inside the archive.",
  },
  {
    format: "archive",
    icon: FileArchive,
    title: "Full archive",
    description:
      "Everything, as a zip: the structured JSON, the UDDF, the full CSV set, every dive-computer file you imported and both sides of every certification card. Those card scans are personal documents — treat the file as one.",
  },
];

interface DataExportCardProps {
  // Only ever used to name the saved file, and only when the server's own name cannot
  // be read - see `exportFilename`. The endpoints take no user parameter at all.
  username: string;
}

// "Your data" on the settings page: three buttons, each handing back the whole logbook.
// The product's promise is that nothing in an account is reachable only through this
// app, and this card is the falsifiable half of it.
//
// Downloads go through the API client and a synthetic click rather than a plain
// `<a href>` - the endpoints need an `Authorization` header, which a link cannot send
// (the access token lives in memory, not in a cookie). See `lib/download.ts`.
export function DataExportCard({ username }: DataExportCardProps) {
  const { toast } = useToast();
  // A *set* of formats, rather than a boolean or the single `ExportFormat | null` this
  // started as: the three rows run independently, so two concurrent downloads must not
  // clear each other's spinner. DECISIONS.md carries the argument and what each of the
  // simpler shapes gets wrong.
  const [busy, setBusy] = useState<ReadonlySet<ExportFormat>>(new Set());

  const handleDownload = async (row: ExportRow) => {
    // The button is `aria-disabled` rather than `disabled` (see below), so it still
    // takes clicks - this is what makes the row actually inert while it is fetching.
    // A click is a discrete event, so React has flushed the previous one's `setBusy`
    // by the time a second handler reads this.
    //
    // What this prevents is a second *save*, not a second request: `apiClient.get`
    // dedupes in-flight GETs by url+params+responseType, so the duplicate click would
    // join the pending promise rather than spend another of the caller's ten hourly
    // exports. Both callers would then reach `downloadBlob` with the same bytes and
    // write the file twice - and pin a second copy of a possibly-large blob for
    // `REVOKE_DELAY_MS`.
    if (busy.has(row.format)) return;

    try {
      // Functional updates throughout, because concurrent downloads are the point:
      // two handlers reading the same stale `busy` would each write a set missing the
      // other's format.
      setBusy((current) => new Set(current).add(row.format));
      const { blob, filename } = await exportAPI.download(row.format, username);
      downloadBlob(blob, filename);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          // `row.title`, not lowercased: "your UDDF" is the file's name, and
          // "your uddf" reads like a typo.
          `Could not export your ${row.title}. Please try again.`,
        ),
        variant: "destructive",
      });
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(row.format);
        return next;
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <HardDriveDownload className="h-5 w-5" />
          Your Data
        </CardTitle>
        <CardDescription>
          Take a complete copy of your logbook, in formats other programs can
          read. Nothing here is locked to OpenDiving.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {EXPORT_ROWS.map((row) => {
            const Icon = row.icon;
            const isBusy = busy.has(row.format);

            return (
              <li
                key={row.format}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Icon
                    className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{row.title}</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {row.description}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // `aria-disabled:hover:bg-background` because the `outline` variant
                  // carries `hover:bg-accent`, and `aria-disabled` brings none of the
                  // `disabled:pointer-events-none` that would otherwise suppress it -
                  // so without this the inert row still lights up under the cursor.
                  className="shrink-0 self-start aria-disabled:opacity-50 aria-disabled:cursor-default aria-disabled:hover:bg-background"
                  onClick={() => handleDownload(row)}
                  // `aria-disabled`, not `disabled` - the one place this card departs
                  // from every other busy button in the repo, and the reason is the
                  // label below. A real `disabled` drops focus to `<body>` in Chrome
                  // and takes the button out of the tab order, so the diver who just
                  // pressed it is standing nowhere and never hears the name change: the
                  // announcement this is all for is exactly what `disabled` eats.
                  // `aria-disabled` keeps focus where the click left it. Being only
                  // advisory, it is `handleDownload`'s early return that makes the
                  // button inert, and the styling is by variant because
                  // `disabled:opacity-50` keys off the real attribute.
                  //
                  // Only the row being fetched goes inert. The API rate-limits exports
                  // per user, so letting all three run at once is the diver's call to
                  // spend their budget on, not a bug to prevent.
                  aria-disabled={isBusy}
                  // The visible label is the same one word on every row, so without
                  // this a screen reader hears "Download" three times with nothing to
                  // tell them apart.
                  //
                  // It has to *change* with the busy state, not just name the row. An
                  // `aria-label` overrides the button's own text, so a static one hides
                  // the switch to "Preparing..." entirely. `aria-busy` alone would not
                  // fix that - it is inconsistently announced - so the name carries the
                  // state and `aria-busy` backs it up.
                  aria-label={
                    isBusy
                      ? `Preparing ${row.title} export`
                      : `Download ${row.title}`
                  }
                  aria-busy={isBusy}
                >
                  {isBusy ? (
                    <div className="flex items-center space-x-2">
                      <ButtonSpinner />
                      <span>Preparing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Download className="h-4 w-4" />
                      <span>Download</span>
                    </div>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
