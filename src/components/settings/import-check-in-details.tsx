"use client";

import { useMemo, useState } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { UserField } from "@/components/user/user-fields-form";
import type {
  ImportCheckInDetail,
  ImportCheckInDetailKey,
  ImportCheckInSubmission,
} from "@/lib/api/logbook-import";
import {
  CHECK_IN_DETAIL_FIELDS,
  CHECK_IN_DETAIL_LABELS,
  checkInAccountSummary,
  checkInProposalValues,
  checkInSubmission,
} from "@/lib/import-check-in";
import {
  userFieldsSchema,
  type UserFieldValues,
} from "@/lib/validations/user-fields";

export interface ImportCheckIn {
  details: readonly ImportCheckInDetail[];
  form: UseFormReturn<UserFieldValues>;
  kept: ReadonlySet<ImportCheckInDetailKey>;
  toggleKept: (detail: ImportCheckInDetailKey) => void;
  /**
   * Validates what is on screen and resolves to the facts to send: `undefined` when
   * there are none, `null` when a field is invalid and now says why.
   */
  collect: () => Promise<ImportCheckInSubmission | undefined | null>;
}

/**
 * The editable half of an import preview: one form over the check-in facts the
 * document carries, seeded with the API's proposal.
 *
 * Seeded once, so the host mounts it per preview (keyed on the token). The resolver
 * covers only the facts not kept, so a kept fact's proposal cannot block the apply.
 */
export function useImportCheckIn(
  details: readonly ImportCheckInDetail[],
): ImportCheckIn {
  const [kept, setKept] = useState<ReadonlySet<ImportCheckInDetailKey>>(
    () => new Set(),
  );

  const resolver = useMemo(() => {
    const fields = details
      .filter(({ detail }) => !kept.has(detail))
      .flatMap(({ detail }) => CHECK_IN_DETAIL_FIELDS[detail]);
    // Through `unknown` for the reason `UserFieldsForm` gives: a schema built from
    // a runtime list infers an index signature.
    return zodResolver(
      userFieldsSchema(fields),
    ) as unknown as Resolver<UserFieldValues>;
  }, [details, kept]);

  const form = useForm<UserFieldValues>({
    resolver,
    defaultValues: checkInProposalValues(details),
  });

  const toggleKept = (detail: ImportCheckInDetailKey) => {
    form.clearErrors([...CHECK_IN_DETAIL_FIELDS[detail]]);
    setKept((current) => {
      const next = new Set(current);
      if (!next.delete(detail)) next.add(detail);
      return next;
    });
  };

  const collect = async () => {
    if (!(await form.trigger())) return null;
    const submission = checkInSubmission(details, kept, form.getValues());
    return Object.keys(submission).length > 0 ? submission : undefined;
  };

  return { details, form, kept, toggleKept, collect };
}

// Each fact the document carries, the account's value beside the proposal. What is
// in the boxes when the diver imports is what is written; "Keep mine" takes a fact
// out of the apply altogether, which is different from emptying it - an emptied
// fact is cleared from the account.
export function ImportCheckInDetails({ checkIn }: { checkIn: ImportCheckIn }) {
  const { details, form, kept, toggleKept } = checkIn;
  if (details.length === 0) return null;

  return (
    <Form {...form}>
      <div>
        <h3 className="text-sm font-medium">Check-in details</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This file carries details a dive shop asks for. What is in the boxes
          is saved to your account when you import; change or clear any of it,
          or keep yours.
        </p>
        <div className="mt-3 space-y-3">
          {details.map((entry) => {
            const fields = CHECK_IN_DETAIL_FIELDS[entry.detail];
            const mine = checkInAccountSummary(entry);
            const isKept = kept.has(entry.detail);
            return (
              <fieldset
                key={entry.detail}
                className="rounded-md border p-3 space-y-3"
              >
                <legend className="px-1 text-sm font-medium">
                  {CHECK_IN_DETAIL_LABELS[entry.detail]}
                </legend>
                <p className="text-sm text-muted-foreground">
                  Yours now: {mine ?? "not set"}
                </p>
                {isKept ? (
                  <p className="text-sm">
                    {mine
                      ? "Keeping yours; nothing from this file is saved."
                      : "Left unset; nothing from this file is saved."}
                  </p>
                ) : (
                  fields.map((field) => (
                    <UserField
                      key={field}
                      name={field}
                      control={form.control}
                      hideLabel={fields.length === 1}
                    />
                  ))
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleKept(entry.detail)}
                >
                  {isKept
                    ? "Use this file's"
                    : mine
                      ? "Keep mine"
                      : "Leave unset"}
                </Button>
              </fieldset>
            );
          })}
        </div>
      </div>
    </Form>
  );
}
