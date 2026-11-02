"use client";

import { type ReactNode, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HERO_CONTROL } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";

export interface RecordInfoFact {
  label: string;
  // `null` or `undefined` is a field the record has not recorded, which still
  // draws: the dialog lists every field its form has, not only the filled ones.
  value: ReactNode | null | undefined;
  // Across the whole row, for free text a cell would squeeze.
  wide?: boolean;
}

export interface RecordInfoSection {
  heading?: string;
  facts: RecordInfoFact[];
}

/**
 * A record's own fields, every one its form has in the form's order, behind an
 * Info button in a detail page's hero. The records it links to are left to the
 * page's cards.
 *
 * The button keeps its icon alone below `sm`, where the hero's top row has the
 * back link and the other actions to fit beside it.
 */
export function RecordInfoDialog({
  title,
  sections,
}: {
  title: string;
  sections: RecordInfoSection[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={HERO_CONTROL}
        onClick={() => setOpen(true)}
      >
        <Info className="h-4 w-4 sm:mr-2" />
        <span className="max-sm:sr-only">Info</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Read-only, so a click outside has nothing to lose and closes it:
            `undefined` drops `DialogContent`'s guard for half-filled forms. */}
        <DialogContent
          className="sm:max-w-2xl"
          onPointerDownOutside={undefined}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {sections.map((section, index) => (
              <section key={section.heading ?? index}>
                {section.heading && (
                  <h3 className="mb-2 text-sm font-semibold">
                    {section.heading}
                  </h3>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {section.facts.map((fact) => (
                    <div
                      key={fact.label}
                      className={cn("min-w-0", fact.wide && "col-span-full")}
                    >
                      <dt className="text-xs text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd
                        className={cn(
                          "text-sm font-medium break-words",
                          fact.wide && "whitespace-pre-wrap font-normal",
                          isMissing(fact.value) && "text-muted-foreground",
                        )}
                      >
                        {isMissing(fact.value) ? "-" : fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isMissing(value: ReactNode): boolean {
  return value === null || value === undefined || value === "";
}
