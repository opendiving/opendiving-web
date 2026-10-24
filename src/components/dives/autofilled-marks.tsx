"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useFormContext,
  useWatch,
  type Control,
  type FieldValues,
} from "react-hook-form";
import { FormLabelMarkContext } from "@/components/ui/form";
import { Attribution } from "@/components/attribution";
import { FETCHED_MARK_TITLE, type FetchedMarks } from "@/lib/dive-conditions";
import { isNonEmptyFieldValue } from "@/lib/dive-form-fields";

interface AutofilledMarksValue {
  control: unknown;
  isAutofilled: (name: string) => boolean;
  fetched?: FetchedMarks;
}

const AutofilledMarksContext = createContext<AutofilledMarksValue | null>(null);

const DOT = "ml-1.5 inline-block size-1.5 rounded-full bg-teal align-middle";

function AutofilledDot() {
  return <span aria-hidden title="Filled in for you" className={DOT} />;
}

/**
 * The mark on a dive's field that a weather service filled in: the form's dot,
 * titled for what filled it. Unlike the form's own, it is read aloud, since on the
 * dive page no legend explains it.
 */
export function FetchedMark() {
  return (
    <span title={FETCHED_MARK_TITLE} className={DOT}>
      <span className="sr-only">(filled in from weather data)</span>
    </span>
  );
}

// Whether a field still stands as the fetch wrote it once saved: an emptied field
// does, since the API keeps a fill it is sent a blank for.
const keepsFetched = (value: unknown, written: unknown) =>
  value === written || !isNonEmptyFieldValue(value);

// Watches the one field it marks, so the dot goes the moment the diver picks
// another value - which is what saving it would do to the stored mark.
function FetchedFormMark({
  name,
  marks,
  written,
}: {
  name: string;
  marks: AutofilledMarksValue;
  written: unknown;
}) {
  const value = useWatch({ control: marks.control as Control, name });
  if (keepsFetched(value, written)) return <FetchedMark />;
  return marks.isAutofilled(name) ? <AutofilledDot /> : null;
}

function AutofilledMark({ name }: { name: string }) {
  const marks = useContext(AutofilledMarksContext);
  const { control } = useFormContext();
  // A dialog opened from inside the dive form - a picker's "Add new..." - has a form
  // and labels of its own, and its fields' names can collide with the dive's.
  if (!marks || control !== marks.control) return null;
  if (marks.fetched && name in marks.fetched.values) {
    return (
      <FetchedFormMark
        name={name}
        marks={marks}
        written={marks.fetched.values[name]}
      />
    );
  }
  return marks.isAutofilled(name) ? <AutofilledDot /> : null;
}

/**
 * What the marks mean, said once above the form while any field carries one, so
 * no finger has to hover a dot to find out. Hidden from a screen reader along
 * with the dots it explains.
 */
export function AutofilledLegend() {
  return (
    <p
      aria-hidden
      className="flex items-center gap-1.5 px-(--card-pad) text-sm text-muted-foreground"
    >
      <span className="inline-block size-1.5 rounded-full bg-teal" />
      Filled in for you
    </p>
  );
}

function FetchedSourceLine({
  control,
  fetched,
}: {
  control: Control;
  fetched: FetchedMarks;
}) {
  const names = Object.keys(fetched.values);
  const values = useWatch({ control, name: names }) as unknown[];
  if (
    !names.some((name, index) =>
      keepsFetched(values[index], fetched.values[name]),
    )
  ) {
    return null;
  }
  return (
    <p className="text-xs text-muted-foreground">
      <Attribution value={fetched.attribution} />
    </p>
  );
}

/**
 * The weather service's credit, as visible text under a form's fields while any of
 * them still holds the value it filled in - the licence asks for it beside the
 * data wherever the data is shown.
 */
export function FetchedSource<TFieldValues extends FieldValues>({
  control,
}: {
  control: Control<TFieldValues>;
}) {
  const marks = useContext(AutofilledMarksContext);
  if (!marks?.fetched || marks.control !== control) return null;
  if (Object.keys(marks.fetched.values).length === 0) return null;
  return (
    <FetchedSourceLine
      control={control as unknown as Control}
      fetched={marks.fetched}
    />
  );
}

const renderMark = (name: string) => <AutofilledMark name={name} />;

/**
 * Puts a teal dot after the label of every field in `control`'s form that
 * `isAutofilled` says the form changed on its own and the diver has not since,
 * and after every field still holding the value `fetched` says a weather service
 * wrote into the stored dive.
 */
export function AutofilledMarks<TFieldValues extends object>({
  control,
  isAutofilled,
  fetched,
  children,
}: {
  control: Control<TFieldValues>;
  isAutofilled: (name: string) => boolean;
  fetched?: FetchedMarks;
  children: ReactNode;
}) {
  return (
    <AutofilledMarksContext.Provider value={{ control, isAutofilled, fetched }}>
      <FormLabelMarkContext.Provider value={renderMark}>
        {children}
      </FormLabelMarkContext.Provider>
    </AutofilledMarksContext.Provider>
  );
}
