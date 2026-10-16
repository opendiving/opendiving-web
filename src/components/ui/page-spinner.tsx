import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageSpinnerProps {
  /**
   * `screen` fills the viewport - for the top-level auth gate, where nothing
   * around it has rendered yet.
   *
   * `inset` reserves 60vh instead, for a page that renders *below* `AppShell`'s
   * header and footer. Using the full viewport height there pushes the footer off
   * the bottom of a page that was about to be shorter than one, so the layout
   * visibly settles when the data lands. See DECISIONS.md - the list and detail
   * pages do this deliberately.
   */
  variant?: "screen" | "inset";
  className?: string;
}

// The app's loading placeholder while auth or route data resolves.
//
// The variant keeps the deliberate difference between the two heights in one
// place rather than at every call site.
export function PageSpinner({
  variant = "screen",
  className,
}: PageSpinnerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        variant === "screen" ? "min-h-screen" : "min-h-[60vh]",
        className,
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
