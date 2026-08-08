"use client";

import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { DiveFileImport } from "@/components/dives/dive-file-import";
import {
  DiveFormFields,
  DiveFormValues,
} from "@/components/dives/dive-form-fields";
import { DiveFormActions } from "@/components/dives/dive-form-actions";
import { MixtureFieldArray } from "@/components/dives/mixture-fields";

export interface DiveFormCardProps<TFieldValues extends DiveFormValues> {
  form: UseFormReturn<TFieldValues>;
  mixtureFieldArray: MixtureFieldArray;
  mode: "create" | "edit";
  userId: string;
  onSubmit: (data: TFieldValues) => void | Promise<void>;
  isSubmitting: boolean;
  cancelHref: string;
  submittingLabel: string;
  submitLabel: string;
}

// The "Dive Details" card shared by the create and edit dive pages: file
// import, the main form fields (including gas mixtures), and the
// cancel/submit action row - identical between the two pages apart from
// `mode`/`userId`/`onSubmit`/the action labels, which are the only pieces
// that actually differ between logging a new dive and editing an existing one.
export function DiveFormCard<TFieldValues extends DiveFormValues>({
  form,
  mixtureFieldArray,
  mode,
  userId,
  onSubmit,
  isSubmitting,
  cancelHref,
  submittingLabel,
  submitLabel,
}: DiveFormCardProps<TFieldValues>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dive Details</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Import from dive computer file */}
            <DiveFileImport
              form={form}
              replaceMixtures={mixtureFieldArray.replace}
            />

            <DiveFormFields
              control={form.control}
              mode={mode}
              userId={userId}
              mixtureFieldArray={mixtureFieldArray}
            />

            <DiveFormActions
              cancelHref={cancelHref}
              isSubmitting={isSubmitting}
              submittingLabel={submittingLabel}
              submitLabel={submitLabel}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
