"use client";

import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EditControl } from "@/components/ui/edit-control";
import { DiveSectionIcon } from "@/components/dives/dive-section-icon";
import type { DiveFormFieldGroup } from "@/lib/dive-form-fields";
import { cn } from "@/lib/utils";

interface DiveCardHeaderProps {
  /** The dive form's section the card shows, which names its glyph. */
  group: DiveFormFieldGroup;
  title: string;
  /** Opens the section's edit dialog; absent, the card has no control. */
  onEdit?: () => void;
}

// A dive page card's heading, and the pencil that edits the card where it has one.
export function DiveCardHeader({ group, title, onEdit }: DiveCardHeaderProps) {
  return (
    <CardHeader>
      <div className={cn(onEdit && CARD_TITLE_ROW)}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <DiveSectionIcon group={group} />
          {title}
        </CardTitle>
        {onEdit && (
          <EditControl
            label={`Edit ${title.toLowerCase()}`}
            className={CARD_TITLE_ACTION}
            onClick={onEdit}
          />
        )}
      </div>
    </CardHeader>
  );
}
