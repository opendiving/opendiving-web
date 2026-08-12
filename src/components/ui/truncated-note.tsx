import { AlertTriangle } from "lucide-react";

interface TruncatedNoteProps {
  // Where the full list can be seen, in the app's own words ("your gear",
  // "your certifications").
  where: string;
}

// Shown under a dashboard card whose API response came back with `truncated: true`.
//
// Both overview endpoints (`/gear-service-due`, `/certifications-expiring`) return every
// matching row rather than a date-filtered slice, so both cap the row count. Without this
// note the cap is invisible: the card looks like the complete answer while some overdue
// gear simply isn't in it. For safety-adjacent lists, under-reporting silently is the
// wrong direction to fail in - so the card says it is partial rather than implying it
// isn't.
export function TruncatedNote({ where }: TruncatedNoteProps) {
  return (
    <p className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        There is more than fits here. Check {where} for the full list.
      </span>
    </p>
  );
}
