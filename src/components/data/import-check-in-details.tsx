"use client";

import { useMemo, useState } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { UserField } from "@/components/user/user-fields-form";
import { PortraitFrame, PortraitImage } from "@/components/user/portrait-image";
import { useAuth } from "@/contexts/AuthContext";
import type {
  ImportCheckInDetail,
  ImportCheckInDetailKey,
  ImportCheckInSubmission,
  ImportPortraitChoice,
  ImportPortraitOffer,
} from "@/lib/api/logbook-import";
import {
  CHECK_IN_DETAIL_FIELDS,
  CHECK_IN_DETAIL_LABELS,
  checkInAccountSummary,
  checkInProposalValues,
  checkInSubmission,
  portraitChoice,
} from "@/lib/import-check-in";
import { cn } from "@/lib/utils";
import {
  userFieldsSchema,
  type UserFieldValues,
} from "@/lib/validations/user-fields";

/** What the apply sends beside the file and the token; each part omitted when empty. */
export interface ImportCheckInChoices {
  details?: ImportCheckInSubmission;
  portrait?: ImportPortraitChoice;
}

export interface ImportCheckIn {
  details: readonly ImportCheckInDetail[];
  form: UseFormReturn<UserFieldValues>;
  kept: ReadonlySet<ImportCheckInDetailKey>;
  toggleKept: (detail: ImportCheckInDetailKey) => void;
  portrait: ImportPortraitOffer | null;
  portraitKept: boolean;
  togglePortraitKept: () => void;
  /**
   * Validates what is on screen and resolves to what to send, or to `null` when a
   * field is invalid and now says why.
   */
  collect: () => Promise<ImportCheckInChoices | null>;
}

/**
 * The editable half of an import preview: one form over the check-in facts the
 * document carries, seeded with the API's proposal, and the archive's portrait,
 * taken unless kept.
 *
 * Seeded once, so the host mounts it per preview (keyed on the token). The resolver
 * covers only the facts not kept, so a kept fact's proposal cannot block the apply.
 */
export function useImportCheckIn(
  details: readonly ImportCheckInDetail[],
  portrait: ImportPortraitOffer | null,
): ImportCheckIn {
  const [kept, setKept] = useState<ReadonlySet<ImportCheckInDetailKey>>(
    () => new Set(),
  );
  const [portraitKept, setPortraitKept] = useState(false);

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

  const collect = async (): Promise<ImportCheckInChoices | null> => {
    if (!(await form.trigger())) return null;
    const submission = checkInSubmission(details, kept, form.getValues());
    return {
      details: Object.keys(submission).length > 0 ? submission : undefined,
      portrait: portraitChoice(portrait, portraitKept),
    };
  };

  return {
    details,
    form,
    kept,
    toggleKept,
    portrait,
    portraitKept,
    togglePortraitKept: () => setPortraitKept((current) => !current),
    collect,
  };
}

// The archive's portrait beside the account's, the archive's chosen. "Keep mine"
// still sends a choice, `keep`: the apply is told which portrait the diver saw.
function ImportPortraitRow({
  offer,
  kept,
  onToggle,
}: {
  offer: ImportPortraitOffer;
  kept: boolean;
  onToggle: () => void;
}) {
  const { user } = useAuth();
  const mine = offer.account_sha256;
  const chosen = "ring-2 ring-primary ring-offset-2 ring-offset-background";

  return (
    <fieldset className="rounded-md border p-3 space-y-3">
      <legend className="px-1 text-sm font-medium">Portrait</legend>
      <div className="flex gap-4">
        <figure className="w-20 space-y-1">
          {mine ? (
            <PortraitImage
              name={user?.name ?? ""}
              portraitSha={mine}
              className={cn("w-full", kept && chosen)}
            />
          ) : (
            <PortraitFrame
              empty
              role="img"
              aria-label="No portrait"
              className={cn("w-full", kept && chosen)}
            >
              <UserSquare
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            </PortraitFrame>
          )}
          <figcaption className="text-xs text-muted-foreground">
            Yours now
          </figcaption>
        </figure>
        <figure className="w-20 space-y-1">
          <PortraitFrame className={cn("w-full", !kept && chosen)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- an inline data URL */}
            <img
              src={offer.proposed}
              alt="Portrait from this file"
              className="h-full w-full object-cover"
            />
          </PortraitFrame>
          <figcaption className="text-xs text-muted-foreground">
            {"This file's"}
          </figcaption>
        </figure>
      </div>
      <p className="text-sm">
        {kept
          ? mine
            ? "Keeping yours; nothing from this file is saved."
            : "Left unset; nothing from this file is saved."
          : mine
            ? "This file's replaces yours when you import."
            : "This file's is saved when you import."}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onToggle}>
        {kept ? "Use this file's" : mine ? "Keep mine" : "Leave unset"}
      </Button>
    </fieldset>
  );
}

// Each fact the document carries, the account's value beside the proposal, and the
// archive's portrait beside the account's. What is in the boxes when the diver
// imports is what is written; "Keep mine" takes a fact out of the apply altogether,
// which is different from emptying it - an emptied fact is cleared from the account.
export function ImportCheckInDetails({ checkIn }: { checkIn: ImportCheckIn }) {
  const { details, form, kept, toggleKept, portrait } = checkIn;
  if (details.length === 0 && !portrait) return null;

  return (
    <Form {...form}>
      <div>
        <h3 className="text-sm font-medium">Check-in details</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This file carries what a dive shop asks for at check-in. What is
          chosen below is saved to your account when you import
          {details.length > 0
            ? "; change or clear any detail, or keep yours."
            : ", unless you keep yours."}
        </p>
        <div className="mt-3 space-y-3">
          {portrait && (
            <ImportPortraitRow
              offer={portrait}
              kept={checkIn.portraitKept}
              onToggle={checkIn.togglePortraitKept}
            />
          )}
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
