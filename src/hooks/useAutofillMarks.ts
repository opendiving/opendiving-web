"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { isNonEmptyFieldValue } from "@/lib/dive-form-fields";

type Row = Record<string, unknown>;
type Marks = Readonly<Record<string, unknown>>;

const MIXTURE_CELL = /^mixtures\.(\d+)\.(.+)$/;

/** Structural equality for form values, which are plain JSON. */
function sameValue(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (first == null || second == null) return first == null && second == null;
  return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * The marks of a cylinder list moved onto its new rows: each new row takes the
 * marks of the first old row after the last match holding the same values, and
 * an old row matching nothing - a tank removed, or a list replaced whole - takes
 * its marks with it. A new row matching nothing starts with none.
 */
export function realignMixtureMarks(
  marks: Marks,
  before: readonly Row[],
  after: readonly Row[],
): Record<string, unknown> {
  const moved = new Map<number, number>();
  let from = 0;
  after.forEach((row, to) => {
    for (let index = from; index < before.length; index++) {
      if (!sameValue(before[index], row)) continue;
      moved.set(index, to);
      from = index + 1;
      return;
    }
  });

  const next: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(marks)) {
    const cell = MIXTURE_CELL.exec(path);
    if (!cell) {
      next[path] = value;
      continue;
    }
    const to = moved.get(Number(cell[1]));
    if (to !== undefined) next[`mixtures.${to}.${cell[2]}`] = value;
  }
  return next;
}

export interface AutofillMarks {
  /** Whether the field at `name` - a key, or `mixtures.<i>.<column>` - is marked. */
  isMarked: (name: string) => boolean;
  /** Whether any field is marked. */
  anyMarked: boolean;
  /**
   * Records an automatic write of `after` over `before` at `path`: a field, or
   * `mixtures` for the whole cylinder list, compared cell by cell. What the write
   * changed to a value is marked; what it left alone or emptied keeps its mark,
   * or its lack of one. Called before the write lands.
   */
  note: (path: string, before: unknown, after: unknown) => void;
}

/**
 * Which fields of a form hold a value the form filled in itself, for the teal
 * mark on their labels.
 *
 * A mark is set only where an automatic write changed the field, and goes only
 * when the diver changes that field: react-hook-form sets `type` on a watch event
 * only for a field's own `onChange`, never for `setValue`, `reset` or a
 * field-array write, so an import or a hide leaves the marks where they are. A
 * cylinder is a field too, so removing or adding one moves the marks with their
 * rows rather than leaving them on whatever row takes the index.
 */
export function useAutofillMarks<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
): AutofillMarks {
  const [marks, setMarks] = useState<Marks>({});
  // Mirrors, readable synchronously from the watch callback and from a `note`
  // that follows another in the same tick.
  const marksRef = useRef<Marks>(marks);
  // The cylinder list as last seen, and as the last noted write left it - the
  // field-array event that write raises is not a structural change to realign.
  const rowsRef = useRef<readonly Row[]>([]);
  const expectedRowsRef = useRef<readonly Row[] | null>(null);

  const commit = useCallback((next: Marks) => {
    marksRef.current = next;
    setMarks(next);
  }, []);

  useEffect(() => {
    const read = (name: string) =>
      form.getValues(name as unknown as Path<TFieldValues>) as unknown;
    const readRows = () => (read("mixtures") as Row[] | undefined) ?? [];
    rowsRef.current = readRows();

    const subscription = form.watch((_values, { name, type }) => {
      const current = marksRef.current;
      if (type === "change" && name) {
        if (name in current && !sameValue(current[name], read(name))) {
          commit(
            Object.fromEntries(
              Object.entries(current).filter(([path]) => path !== name),
            ),
          );
        }
      } else {
        let next: Record<string, unknown> = { ...current };
        let changed = false;
        if (name === "mixtures") {
          const rows = readRows();
          if (sameValue(rows, expectedRowsRef.current)) {
            expectedRowsRef.current = null;
          } else {
            next = realignMixtureMarks(next, rowsRef.current, rows);
            changed = true;
          }
        }
        // A write that is not the diver's keeps the mark and moves its value, so
        // the diver's next edit is measured against what the field holds.
        for (const path of Object.keys(next)) {
          const value = read(path);
          if (sameValue(next[path], value)) continue;
          next[path] = value;
          changed = true;
        }
        if (changed) commit(next);
      }
      if (name === undefined || name.startsWith("mixtures")) {
        rowsRef.current = readRows();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, commit]);

  const note = useCallback(
    (path: string, before: unknown, after: unknown) => {
      const next: Record<string, unknown> = { ...marksRef.current };
      const mark = (at: string, was: unknown, now: unknown) => {
        if (!sameValue(was, now) && isNonEmptyFieldValue(now)) next[at] = now;
      };

      if (path !== "mixtures") {
        mark(path, before, after);
      } else {
        const was = (before as Row[] | undefined) ?? [];
        const now = (after as Row[] | undefined) ?? [];
        // A row past the new end is gone, and so is its mark.
        for (const at of Object.keys(next)) {
          const cell = MIXTURE_CELL.exec(at);
          if (cell && Number(cell[1]) >= now.length) delete next[at];
        }
        now.forEach((row, index) => {
          for (const [column, cell] of Object.entries(row)) {
            mark(`mixtures.${index}.${column}`, was[index]?.[column], cell);
          }
        });
        expectedRowsRef.current = now;
      }
      commit(next);
    },
    [commit],
  );

  const isMarked = useCallback((name: string) => name in marks, [marks]);

  return { isMarked, anyMarked: Object.keys(marks).length > 0, note };
}
