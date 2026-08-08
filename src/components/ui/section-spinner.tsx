import { Loader2 } from "lucide-react";

// A centered spinner for a loading section within a page, as opposed to
// `PageSpinner`, which is full-viewport and used for the top-level
// auth-loading gate.
export function SectionSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
