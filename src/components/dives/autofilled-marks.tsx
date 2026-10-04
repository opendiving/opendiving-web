"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFormContext, useWatch, type Control } from "react-hook-form";
import { FormLabelMarkContext } from "@/components/ui/form";

interface AutofilledMarksValue {
  control: unknown;
  isAutofilled: (name: string, value: unknown) => boolean;
}

const AutofilledMarksContext = createContext<AutofilledMarksValue | null>(null);

function AutofilledMark({ name }: { name: string }) {
  const marks = useContext(AutofilledMarksContext);
  const { control } = useFormContext();
  const value = useWatch({ control, name });
  // A dialog opened from inside the dive form - a picker's "Add new..." - has a form
  // and labels of its own, and its fields' names can collide with the dive's.
  if (!marks || control !== marks.control) return null;
  if (!marks.isAutofilled(name, value)) return null;
  return (
    <span
      aria-hidden
      title="Filled in for you"
      className="ml-1.5 inline-block size-1.5 rounded-full bg-teal align-middle"
    />
  );
}

const renderMark = (name: string) => <AutofilledMark name={name} />;

/**
 * Puts a teal dot after the label of every field in `control`'s form that
 * `isAutofilled` says still holds a value the form filled in on its own.
 */
export function AutofilledMarks<TFieldValues extends object>({
  control,
  isAutofilled,
  children,
}: {
  control: Control<TFieldValues>;
  isAutofilled: (name: string, value: unknown) => boolean;
  children: ReactNode;
}) {
  return (
    <AutofilledMarksContext.Provider value={{ control, isAutofilled }}>
      <FormLabelMarkContext.Provider value={renderMark}>
        {children}
      </FormLabelMarkContext.Provider>
    </AutofilledMarksContext.Provider>
  );
}
