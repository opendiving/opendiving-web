"use client";

import { useFormState } from "react-hook-form";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";

interface DialogSubmitButtonProps {
  isEdit: boolean;
  // What the button says on a create dialog, e.g. "Create trip".
  createLabel: string;
  // What it says while a create is in flight.
  creatingLabel?: string;
}

// The submit button of a create/edit dialog. It reads `isSubmitting` from the
// surrounding form, so it has to sit inside that form's `<Form>` provider and the
// dialog's `onSubmit` has to return its promise for the spinner to last as long as
// the save does.
export function DialogSubmitButton({
  isEdit,
  createLabel,
  creatingLabel = "Creating...",
}: DialogSubmitButtonProps) {
  const { isSubmitting } = useFormState();

  return (
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? (
        <>
          <ButtonSpinner className="mr-2" />
          {isEdit ? "Saving..." : creatingLabel}
        </>
      ) : isEdit ? (
        <>
          <Save className="h-4 w-4 mr-2" />
          Save changes
        </>
      ) : (
        <>
          <Plus className="h-4 w-4 mr-2" />
          {createLabel}
        </>
      )}
    </Button>
  );
}
