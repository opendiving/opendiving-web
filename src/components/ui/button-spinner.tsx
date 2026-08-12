import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonSpinnerProps {
  className?: string;
}

// The in-button "working..." indicator.
//
// Five forms each hand-rolled this as a `<div>` with
// `animate-spin rounded-full h-4 w-4 border-b-2 border-white` - a bordered CSS ring
// rather than the `Loader2` icon every other spinner in the app uses, and hardcoded
// to white, which is only correct on a dark-filled button and wrong on the outline
// and ghost variants.
//
// `currentColor` is what fixes that: the spinner takes the button's own text
// colour, so it is correct on every variant and in both themes without anyone
// having to remember.
export function ButtonSpinner({ className }: ButtonSpinnerProps) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}
