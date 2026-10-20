"use client";

import { ImportDiveTable } from "@/components/import/import-dive-table";
import {
  ImportCheckInDetails,
  useImportCheckIn,
  type ImportCheckInChoices,
} from "@/components/import/import-check-in-details";
import { ImportReportView } from "@/components/import/import-report-view";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import type { ImportPreview } from "@/lib/api/logbook-import";
import { importButtonLabel } from "@/lib/logbook-import";

interface ImportReviewProps {
  preview: ImportPreview;
  isImporting: boolean;
  /** Held back while an import or a drop is in flight. */
  disabled: boolean;
  onImport: (choices: ImportCheckInChoices) => void;
}

// The plan waiting for the diver's word. Mounted per preview, keyed on its token,
// so the check-in form inside it is seeded from this preview's proposal and no
// other. The button is held back only while something is in flight - see
// `importButtonLabel`.
export function ImportReview({
  preview,
  isImporting,
  disabled,
  onImport,
}: ImportReviewProps) {
  const checkIn = useImportCheckIn(preview.check_in_details, preview.portrait);

  const handleImport = async () => {
    const choices = await checkIn.collect();
    if (choices !== null) onImport(choices);
  };

  return (
    <section aria-labelledby="import-review-heading" className="space-y-4">
      <div>
        <h2 id="import-review-heading" className="text-lg font-semibold">
          What the Import Would Do
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing has been written yet.
        </p>
      </div>

      {preview.dives.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">
            Dives ({preview.dives.length})
          </h3>
          <div className="mt-2">
            <ImportDiveTable
              dives={preview.dives}
              members={preview.members}
              written={false}
            />
          </div>
        </div>
      )}

      <ImportReportView report={preview} archive={preview.archive} />

      <ImportCheckInDetails checkIn={checkIn} />

      <Button type="button" onClick={handleImport} disabled={disabled}>
        {isImporting ? (
          <span className="flex items-center gap-2">
            <ButtonSpinner />
            Importing...
          </span>
        ) : (
          importButtonLabel(preview.dives)
        )}
      </Button>
    </section>
  );
}
