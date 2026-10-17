import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonSpinnerProps {
  className?: string;
}

// The small inline "working..." indicator: in a button, and anywhere else a
// line of text or a control needs one at its own size - a field, a list row, a
// status line.
//
// `currentColor` rather than a fixed colour, so it takes its surroundings' text
// colour: correct on every button variant and in both themes without anyone
// having to remember.
export function ButtonSpinner({ className }: ButtonSpinnerProps) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}
