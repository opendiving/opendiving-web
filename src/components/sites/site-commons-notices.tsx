"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useToast } from "@/components/ui/use-toast";
import { diveSitesAPI, type DiveSite } from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";

export const WAITING_FOR_REVIEW = "Waiting for review";

const NOTICE = "mb-4 rounded-md border bg-muted/40 p-3 text-sm max-sm:mb-2.5";

// Where the diver's proposal on a site stands: waiting, with the way to take it back,
// or declined, with the reason until they propose again.
export function SiteProposalNotice({
  site,
  onWithdrawn,
}: {
  site: DiveSite;
  onWithdrawn: () => void;
}) {
  const { toast } = useToast();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const { proposal } = site;
  if (!proposal) return null;

  const withdraw = async () => {
    setIsWithdrawing(true);
    try {
      await diveSitesAPI.withdrawDiveSiteProposal(proposal.uuid);
      toast({ title: "Proposal withdrawn." });
      onWithdrawn();
    } catch (error) {
      toast({
        title: getApiErrorMessage(
          error,
          "Failed to withdraw your proposal. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (proposal.status === "declined") {
    return (
      <div className={NOTICE}>
        <p className="font-medium">Your proposal was declined.</p>
        <p className="whitespace-pre-wrap text-muted-foreground">
          {proposal.reason}
        </p>
      </div>
    );
  }

  return (
    <div className={`${NOTICE} flex flex-wrap items-center gap-3`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{WAITING_FOR_REVIEW}</p>
        <p className="text-muted-foreground">
          {proposal.kind === "change"
            ? "Everyone, you included, sees this site as it is until a reviewer accepts your change."
            : "This site stays yours and private until a reviewer accepts it."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isWithdrawing}
        onClick={() => void withdraw()}
      >
        {isWithdrawing && <ButtonSpinner />}
        Withdraw
      </Button>
    </div>
  );
}

// A diver's own site that shares a registry entry with a Commons record, which is
// what a pick from the old catalogue left behind.
export function SiteCommonsMatchNotice({
  site,
  onReplace,
}: {
  site: DiveSite;
  onReplace: () => void;
}) {
  const match = site.commons_match;
  if (!match) return null;
  return (
    <div className={`${NOTICE} flex flex-wrap items-center gap-3`}>
      <p className="min-w-0 flex-1">
        This site is in OpenDiving Commons as{" "}
        <Link
          href={`/sites/${match.uuid}`}
          className="underline hover:text-muted-foreground"
        >
          {match.name}
        </Link>
        .
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onReplace}>
        Replace with Commons site
      </Button>
    </div>
  );
}
