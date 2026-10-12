"use client";

import { SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";

interface EditControlProps {
  /** The hover hint, and the button's accessible name. */
  label: string;
  onClick: () => void;
  /** On the button: a margin that lets it overhang the line it sits on. */
  className?: string;
}

// The pencil that opens one part of a page in a dialog - a check-in section, a dive
// page card. Never printed: a sheet handed to a desk has nothing to click. A flex
// box rather than a block, so the button is not set on a text line, whose strut
// would stand below it.
export function EditControl({ label, onClick, className }: EditControlProps) {
  return (
    <div className="flex print:hidden">
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
