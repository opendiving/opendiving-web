"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import type { ExternalId } from "@/lib/api/dive-sites";
import { registryLabel, sameExternalId } from "@/lib/external-ids";
import { ExternalIdLink } from "@/components/sites/external-id-link";

export interface ExternalIdsFieldProps {
  value: ExternalId[];
  onChange: (externalIds: ExternalId[]) => void;
}

// The registry entries the site carries, each removable. There is no box to type
// one: an entry arrives with a catalogue pick or an import, and an identifier
// typed by hand is one nobody checked against the registry.
export function ExternalIdsField({ value, onChange }: ExternalIdsFieldProps) {
  if (value.length === 0) return null;
  return (
    <fieldset>
      <legend className="text-sm font-medium leading-none">
        In other registries
      </legend>
      <ul className="mt-2 space-y-1">
        {value.map((entry) => {
          const name = `${registryLabel(entry.registry)} ${entry.identifier}`;
          return (
            <li
              key={`${entry.registry}:${entry.identifier}`}
              className="flex items-center gap-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <ExternalIdLink entry={entry} />
              </span>
              <IconTooltip label={`Remove ${name}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(
                      value.filter((other) => !sameExternalId(other, entry)),
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
