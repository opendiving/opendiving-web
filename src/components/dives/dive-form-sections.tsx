"use client";

import { useCallback, useState } from "react";
import {
  useSectionIndex,
  type SectionIndex,
} from "@/components/ui/section-index";
import {
  DIVE_FORM_FIELD_GROUPS,
  type DiveFormFieldGroup,
} from "@/lib/dive-form-fields";

export interface DiveFormSections {
  collapsedGroups: ReadonlySet<DiveFormFieldGroup>;
  setGroupOpen: (group: DiveFormFieldGroup, open: boolean) => void;
  openGroups: (groups: Iterable<DiveFormFieldGroup>) => void;
  // Lists the sections in form order, and opens a collapsed one it jumps to
  // through the section's own `onOpenChange`.
  index: SectionIndex;
}

/**
 * The open/collapsed state of the dive form's sections and the index over them,
 * owned by `DiveForm` and handed down through `SectionIndexProvider`.
 */
export function useDiveFormSections(): DiveFormSections {
  const [collapsedGroups, setCollapsedGroups] = useState<
    ReadonlySet<DiveFormFieldGroup>
  >(() => new Set());

  const setGroupOpen = useCallback(
    (group: DiveFormFieldGroup, open: boolean) =>
      setCollapsedGroups((current) => {
        if (current.has(group) !== open) return current;
        const next = new Set(current);
        if (open) next.delete(group);
        else next.add(group);
        return next;
      }),
    [],
  );
  const openGroups = useCallback(
    (groups: Iterable<DiveFormFieldGroup>) =>
      setCollapsedGroups((current) => {
        const next = new Set(current);
        for (const group of groups) next.delete(group);
        return next.size === current.size ? current : next;
      }),
    [],
  );

  const index = useSectionIndex(DIVE_FORM_FIELD_GROUPS);

  return { collapsedGroups, setGroupOpen, openGroups, index };
}
