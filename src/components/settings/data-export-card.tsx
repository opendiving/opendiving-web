"use client";

import { useState } from "react";
import {
  Download,
  FileArchive,
  FileCode,
  FileJson,
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
// is - a diver choosing between four downloads is asking "which one has my stuff in
// it". Two of them can answer "all of it", and the difference between those two is the
// only thing this copy has to get across: DiveJSON holds everything the account has as
// data, the archive holds that plus the files that were uploaded into it. Which is also
// why the archive is the row that mentions the certification scans and the portrait -
// the one thing here worth knowing *before* the file lands in a downloads folder, not
// after.
//
// DiveJSON leads because it is the complete one and the app's own format; the two lossy
// rows below it are for handing to something else.
//
// Three of the four also come *back* - DiveJSON, UDDF and the archive, through the import
// card below this one, which reads every format the API's converter reads. The CSV row
// deliberately stays silent, and that asymmetry is the point: a sentence about what one
// format can do is read as a claim about the ones beside it, so "brings it back" on every
// row would promise a CSV import that does not exist.
//
// This comment said "two of the four" and named UDDF as one of the two that could not
// come back, which was true until the API grew a converter and then was not. That is the
// ordinary way this card's copy goes wrong - see "A sentence about what one format lacks
// is a claim about all of them" in DECISIONS.md.
const EXPORT_ROWS: ExportRow[] = [
  {
    format: "divejson",
    icon: FileJson,
    title: "DiveJSON",
    description:
      "Your whole logbook in one file: every dive with every recording that made it — each one's device, its files and its full sample profile — plus cylinders, sites, trips, courses, marine life, gear with its service history, your c-card records and your contacts. Everything in the account except the uploaded files themselves, which it names by digest. DiveJSON is the open dive-log format this project maintains, and this app is its reference implementation — so this is the one that comes back with nothing lost.",
  },
  {
    format: "uddf",
    icon: FileCode,
    title: "UDDF",
    description:
      "Every dive with its sites, trips, gases, cylinders, gear and sample profile, plus your contacts — as dive bases, shops and the places you stayed — and your date of birth, phone and dive insurance, in the open format Subsurface, MacDive and divelogs.de import. A dive recorded by two computers writes one profile here — the recording shown by default — because a UDDF dive carries one set of samples; the DiveJSON and the archive carry them all. This is the file to hand another program, and the import card below reads it back too — gear sets, service history, your courses, your c-cards, your emergency contact and your insurance policy number have no slot in it, and ride in the DiveJSON and the archive instead.",
  },
  {
    format: "csv",
    icon: Sheet,
    title: "Spreadsheet",
    description:
      "One row per dive, flattened for Excel, Numbers or a notebook. The normalized set — cylinders, trips, sites, gear, service history, courses, certifications, contacts — rides in the DiveJSON, and as its own CSVs inside the archive.",
  },
  {
    format: "archive",
    icon: FileArchive,
    title: "Full archive",
    description:
      "Everything, as a zip: the DiveJSON, the UDDF, the full CSV set, every dive-computer file you uploaded — each under the recording it belongs to — and every certification card image you uploaded. This is the one to keep as a backup — it is also the only download that can put those files back, since the import card below can restore bytes it actually carries. Your portrait is in it too, and importing the archive offers it back beside yours. The card scans and the portrait are personal documents, so treat the file as one.",
  },
];

interface DataExportCardProps {
  // Only ever used to name the saved file, and only when the server's own name cannot
  // be read - see `exportFilename`. The endpoints take no user parameter at all.
  username: string;
}

// "Your data" on the settings page: four buttons, each handing back the whole logbook.
// The product's promise is that nothing in an account is reachable only through this
// app, and this card is the half that can be checked by pressing a button. `DataImportCard`
// below it is the other half - a copy nothing can read back is a copy in name only - and
// the two together are what make the round trip a claim rather than an intention.
//
// Downloads go through the API client and a synthetic click rather than a plain
// `<a href>` - the endpoints need an `Authorization` header, which a link cannot send
// (the access token lives in memory, not in a cookie). See `lib/download.ts`.
export function DataExportCard({ username }: DataExportCardProps) {
  const { toast } = useToast();
  // A *set* of formats, rather than a boolean or the single `ExportFormat | null` this
  // started as: the four rows run independently, so two concurrent downloads must not
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
                  // per user, so letting all four run at once is the diver's call to
                  // spend their budget on, not a bug to prevent.
                  aria-disabled={isBusy}
                  // The visible label is the same one word on every row, so without
                  // this a screen reader hears "Download" four times with nothing to
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
