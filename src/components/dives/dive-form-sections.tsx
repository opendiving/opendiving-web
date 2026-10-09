"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TableOfContents } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DiveSectionIcon } from "@/components/dives/dive-section-icon";
import {
  DIVE_FORM_FIELD_GROUPS,
  type DiveFormFieldGroup,
} from "@/lib/dive-form-fields";
import { cn } from "@/lib/utils";

// The dive form's sections as a list to jump by: which are on the page, which the
// reader is in, and the way to each. Every `DiveFormSection` reports itself here
// as it mounts and as its heading sticks, so the list follows the Fields menu
// without restating the show/hide rules the sections are rendered under.

interface SectionHandle {
  element: HTMLElement;
  // Puts the keyboard where the jump landed: on the section's heading where it
  // has a control, else on the card itself.
  focus: () => void;
}

interface SectionRecord extends SectionHandle {
  stuck: boolean;
}

interface DiveFormSectionRegistry {
  register: (group: DiveFormFieldGroup, handle: SectionHandle) => void;
  unregister: (group: DiveFormFieldGroup) => void;
  setStuck: (group: DiveFormFieldGroup, stuck: boolean) => void;
}

export interface DiveFormSectionIndexState {
  /** The sections on the page, in form order. */
  sections: readonly DiveFormFieldGroup[];
  /** The section the viewport is in. */
  active: DiveFormFieldGroup | undefined;
  /** Opens the section if it is collapsed and scrolls its card under the site header. */
  jump: (group: DiveFormFieldGroup) => void;
}

// Two contexts rather than one: the registry never changes, so a section's
// effects can depend on it without re-running every time a heading sticks.
const RegistryContext = createContext<DiveFormSectionRegistry | null>(null);
const IndexContext = createContext<DiveFormSectionIndexState | null>(null);

export interface DiveFormSections {
  collapsedGroups: ReadonlySet<DiveFormFieldGroup>;
  setGroupOpen: (group: DiveFormFieldGroup, open: boolean) => void;
  openGroups: (groups: Iterable<DiveFormFieldGroup>) => void;
  registry: DiveFormSectionRegistry;
  index: DiveFormSectionIndexState;
}

/**
 * Scrolls a section's card to the top of the viewport. `html`'s
 * `scroll-padding-top` lands it under the site header.
 */
export function scrollToSection(element: HTMLElement) {
  element.scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

/**
 * The open/collapsed state of the dive form's sections and the index over them,
 * owned by `DiveForm` and handed down through `DiveFormSectionsProvider`.
 */
export function useDiveFormSections(): DiveFormSections {
  const [collapsedGroups, setCollapsedGroups] = useState<
    ReadonlySet<DiveFormFieldGroup>
  >(() => new Set());
  const [records, setRecords] = useState<
    ReadonlyMap<DiveFormFieldGroup, SectionRecord>
  >(() => new Map());

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

  const registry = useMemo<DiveFormSectionRegistry>(
    () => ({
      register: (group, handle) =>
        setRecords((current) =>
          new Map(current).set(group, { ...handle, stuck: false }),
        ),
      unregister: (group) =>
        setRecords((current) => {
          const next = new Map(current);
          next.delete(group);
          return next;
        }),
      setStuck: (group, stuck) =>
        setRecords((current) => {
          const record = current.get(group);
          if (!record || record.stuck === stuck) return current;
          return new Map(current).set(group, { ...record, stuck });
        }),
    }),
    [],
  );

  // The reader is in the last section whose heading has stuck: every section above
  // it has stuck too, and the one below has not. Nothing stuck is the top of the
  // page, which is the first section.
  const sections = useMemo(
    () => DIVE_FORM_FIELD_GROUPS.filter((group) => records.has(group)),
    [records],
  );
  const active =
    [...sections].reverse().find((group) => records.get(group)?.stuck) ??
    sections[0];

  const jump = useCallback(
    (group: DiveFormFieldGroup) => {
      setGroupOpen(group, true);
      const record = records.get(group);
      if (!record) return;
      scrollToSection(record.element);
      record.focus();
    },
    [records, setGroupOpen],
  );
  const index = useMemo<DiveFormSectionIndexState>(
    () => ({ sections, active, jump }),
    [sections, active, jump],
  );

  return { collapsedGroups, setGroupOpen, openGroups, registry, index };
}

export function DiveFormSectionsProvider({
  sections,
  children,
}: {
  sections: DiveFormSections;
  children: ReactNode;
}) {
  return (
    <RegistryContext.Provider value={sections.registry}>
      <IndexContext.Provider value={sections.index}>
        {children}
      </IndexContext.Provider>
    </RegistryContext.Provider>
  );
}

/** What a section reports itself to; `null` outside a dive form. */
export function useDiveFormSectionRegistry() {
  return useContext(RegistryContext);
}

interface DiveFormSectionIndexProps {
  className?: string;
  // Fires before the jump, for a container that has to close around it.
  onNavigate?: () => void;
}

/**
 * The list of the form's sections, the one the reader is in marked: beside the
 * form on a wide screen, and in a popover from a stuck heading on a narrow one.
 */
export function DiveFormSectionIndex({
  className,
  onNavigate,
}: DiveFormSectionIndexProps) {
  const index = useContext(IndexContext);
  if (!index) return null;
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex flex-col gap-0.5">
        {index.sections.map((group) => {
          const current = group === index.active;
          return (
            <li key={group}>
              <button
                type="button"
                aria-current={current ? "location" : undefined}
                onClick={() => {
                  onNavigate?.();
                  index.jump(group);
                }}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm font-medium touch:py-3",
                  current
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <DiveSectionIcon group={group} className="h-4 w-4" />
                {group}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The index as a popover, from a control a stuck heading shows on a narrow
 * screen - where there is no room beside the form, and the reader is as far
 * from the top of the page as the heading is stuck.
 */
export function DiveFormSectionsTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // A pick moves focus to the section it jumped to; closing any other way hands
  // it back to this control, as a popover does.
  const picked = useRef(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sections"
          className={cn(
            "relative h-7 w-7 text-muted-foreground touch:min-h-0 touch:min-w-0 touch:tap-target",
            className,
          )}
        >
          <TableOfContents className="h-5 w-5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-1"
        onCloseAutoFocus={(event) => {
          if (!picked.current) return;
          picked.current = false;
          event.preventDefault();
        }}
      >
        <DiveFormSectionIndex
          onNavigate={() => {
            picked.current = true;
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
