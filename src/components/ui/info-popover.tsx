import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconTooltip } from "@/components/ui/tooltip";

// What a page or a card is for, behind an icon after its title: a reader needs
// it once, and every visit after that it is only a line between the title and
// what it heads. A popover rather than a hover hint, so a tap opens it on a
// phone.
export function InfoPopover({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <IconTooltip label={label}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground print:hidden"
          >
            <Info className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </IconTooltip>
      <PopoverContent align="start" className="text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}
