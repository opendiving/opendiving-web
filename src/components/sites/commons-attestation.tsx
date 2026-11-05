"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMONS_ATTESTATIONS,
  type DiveSiteProposalKind,
} from "@/lib/api/dive-sites";

const CC0_DEED_URL = "https://creativecommons.org/publicdomain/zero/1.0/";

// The API's limit on a proposal's message.
const MAX_MESSAGE_LENGTH = 2000;

interface CommonsAttestationProps {
  kind: DiveSiteProposalKind;
  ticked: boolean;
  onTickedChange: (ticked: boolean) => void;
  message: string;
  onMessageChange: (message: string) => void;
}

// What every proposal ends on: an optional word for the reviewer, then the proposer's
// own tick on the words the API stores, which is what dedicates the record. The deed
// is linked at the tick, outside its label, so following it does not tick the box.
export function CommonsAttestation({
  kind,
  ticked,
  onTickedChange,
  message,
  onMessageChange,
}: CommonsAttestationProps) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-message`}>A word for the reviewer</Label>
        <Textarea
          id={`${id}-message`}
          value={message}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="Optional. Only the reviewer reads this."
          className="min-h-[60px]"
        />
      </div>
      <div className="space-y-1 text-sm">
        <label className="flex items-start gap-2">
          <Checkbox
            className="mt-0.5"
            checked={ticked}
            onChange={(event) => onTickedChange(event.target.checked)}
          />
          <span>{COMMONS_ATTESTATIONS[kind]}</span>
        </label>
        <p className="pl-6">
          <a
            href={CC0_DEED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground"
          >
            Read the CC0 1.0 deed
          </a>
        </p>
      </div>
    </div>
  );
}
