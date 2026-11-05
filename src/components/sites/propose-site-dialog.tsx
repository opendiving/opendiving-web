"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommonsAttestation } from "@/components/sites/commons-attestation";
import {
  COMMONS_MATCH_RULE_LABELS,
  CommonsCredit,
  commonsCredits,
} from "@/components/sites/commons-site";
import { SHARED_MEMBER_ROWS } from "@/components/sites/shared-member-rows";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { useUnits } from "@/hooks/useUnits";
import {
  COMMONS_ATTESTATIONS,
  diveSitesAPI,
  sharedMembersOf,
  type DiveSite,
  type DiveSiteCommonsMatch,
  type DiveSiteProposal,
  type DiveSiteSharedMembers,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDistance } from "@/lib/geo-distance";

// A record's pin has six decimals, however many the diver's has.
const PUBLISHED_PIN_DECIMALS = 6;

const publishedPin = (coordinate: number | null) =>
  coordinate === null
    ? null
    : Number(coordinate.toFixed(PUBLISHED_PIN_DECIMALS));

function publishedMembers(site: DiveSite): DiveSiteSharedMembers {
  const members = sharedMembersOf(site);
  return {
    ...members,
    latitude: publishedPin(members.latitude),
    longitude: publishedPin(members.longitude),
  };
}

interface ProposeSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The diver's own site.
  site: DiveSite;
  onProposed: (proposal: DiveSiteProposal) => void;
  onReplace: (match: DiveSiteCommonsMatch) => void;
}

function MatchesStep({
  site,
  matches,
  loadError,
  onCancel,
  onContinue,
  onReplace,
}: {
  site: DiveSite;
  matches: DiveSiteCommonsMatch[] | null;
  loadError: string | null;
  onCancel: () => void;
  onContinue: () => void;
  onReplace: (match: DiveSiteCommonsMatch) => void;
}) {
  const units = useUnits();
  const hasPin = site.latitude != null && site.longitude != null;
  const hasIdentityMatch = !!matches?.some(
    (match) => match.rule === "identity",
  );
  const credits = commonsCredits(matches ?? []);

  return (
    <>
      {matches === null && !loadError && (
        <p className="text-sm text-muted-foreground">
          Looking through the Commons...
        </p>
      )}
      <FormApiError error={loadError} />
      {matches?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Commons site looks like this one.
        </p>
      )}
      {!!matches?.length && (
        <ul className="divide-y rounded-md border">
          {matches.map((match) => (
            <li
              key={match.uuid}
              className="flex flex-wrap items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  href={`/sites/${match.uuid}`}
                  className="font-medium break-words underline hover:text-muted-foreground"
                >
                  {match.name}
                </Link>
                {match.location_name && (
                  <p className="text-muted-foreground">{match.location_name}</p>
                )}
                <p className="text-muted-foreground">
                  {COMMONS_MATCH_RULE_LABELS[match.rule]}
                  {match.distance_metres !== null &&
                    ` · ${formatDistance(match.distance_metres, units)} away`}
                </p>
                {match.qualifier_siblings && (
                  <p className="text-muted-foreground">
                    The names differ only by a word like West or East, which
                    usually means two sites.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onReplace(match)}
              >
                Replace with Commons site
              </Button>
            </li>
          ))}
        </ul>
      )}
      {credits.map((credit) => (
        <CommonsCredit key={credit} attribution={credit} />
      ))}
      {matches !== null && !hasPin && (
        <p className="text-sm">
          A site needs a pin to be proposed. Edit this site to add one.
        </p>
      )}
      {hasIdentityMatch && (
        <p className="text-sm">
          This site shares a registry entry with a Commons site, so it is
          already in the Commons: replace it, or propose a change to that one.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {matches !== null && hasPin && !hasIdentityMatch && (
          <Button type="button" onClick={onContinue}>
            Continue as a new site
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function ReviewStep({
  site,
  onBack,
  onProposed,
}: {
  site: DiveSite;
  onBack: () => void;
  onProposed: (proposal: DiveSiteProposal) => void;
}) {
  const units = useUnits();
  const [ticked, setTicked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const members = publishedMembers(site);

  const send = async () => {
    setError(null);
    setIsSending(true);
    try {
      onProposed(
        await diveSitesAPI.proposeDiveSite(site.uuid, {
          attestation: COMMONS_ATTESTATIONS.new_site,
          message,
        }),
      );
    } catch (failure) {
      setError(
        getApiErrorMessage(
          failure,
          "Failed to send your proposal. Please try again.",
        ),
      );
      setIsSending(false);
    }
  };

  return (
    <>
      <section className="space-y-2 text-sm">
        <h3 className="font-semibold">What would be published</h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border bg-muted/40 p-3">
          <dt className="text-muted-foreground">Identifier</dt>
          <dd className="break-all">
            {site.uuid}
            <span className="block break-normal text-xs text-muted-foreground">
              It stays the same, and it encodes when you created this site.
            </span>
          </dd>
          {SHARED_MEMBER_ROWS.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="break-words">
                {row.show(members, units) || (
                  <span className="text-muted-foreground">Not recorded</span>
                )}
              </dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Licence</dt>
          <dd>CC0 1.0</dd>
        </dl>
      </section>
      <section className="space-y-2 text-sm">
        <h3 className="font-semibold">What would not</h3>
        <p>
          Your notes and your tags stay private, and so do your dives. Who
          proposed the site is never published.
        </p>
        <p>
          A reviewer reads the above with your name, and may correct it before
          accepting. An accepted record is public and stays, whatever becomes of
          your account. If it is declined, the site stays yours and private, and
          you are told why.
        </p>
      </section>
      <CommonsAttestation
        kind="new_site"
        ticked={ticked}
        onTickedChange={setTicked}
        message={message}
        onMessageChange={setMessage}
      />
      <FormApiError error={error} />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isSending}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={!ticked || isSending}
          onClick={() => void send()}
        >
          {isSending && <ButtonSpinner />}
          Send proposal
        </Button>
      </DialogFooter>
    </>
  );
}

// Mounted with the open dialog, so opening it again starts from the matches.
function ProposeSiteSteps({
  site,
  onCancel,
  onProposed,
  onReplace,
}: {
  site: DiveSite;
  onCancel: () => void;
  onProposed: (proposal: DiveSiteProposal) => void;
  onReplace: (match: DiveSiteCommonsMatch) => void;
}) {
  const [matches, setMatches] = useState<DiveSiteCommonsMatch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    let active = true;
    diveSitesAPI
      .getCommonsMatches(site.uuid)
      .then((found) => {
        if (active) setMatches(found);
      })
      .catch((failure: unknown) => {
        if (active) {
          setLoadError(
            getApiErrorMessage(
              failure,
              "Failed to look through the Commons. Please try again.",
            ),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [site.uuid]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Propose for OpenDiving Commons</DialogTitle>
        <DialogDescription>
          {isReviewing
            ? "Check what you are offering to everyone."
            : "Is it already in the Commons?"}
        </DialogDescription>
      </DialogHeader>
      {isReviewing ? (
        <ReviewStep
          site={site}
          onBack={() => setIsReviewing(false)}
          onProposed={onProposed}
        />
      ) : (
        <MatchesStep
          site={site}
          matches={matches}
          loadError={loadError}
          onCancel={onCancel}
          onContinue={() => setIsReviewing(true)}
          onReplace={onReplace}
        />
      )}
    </>
  );
}

// A diver's own site on its way to the Commons: first whether it is there already,
// then exactly what would be published, then the attestation. The site is sent as
// it stands, so nothing here is a form. No map, so nothing here adds one to `/privacy`
// §4.4.
export function ProposeSiteDialog({
  open,
  onOpenChange,
  site,
  onProposed,
  onReplace,
}: ProposeSiteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ProposeSiteSteps
          site={site}
          onCancel={() => onOpenChange(false)}
          onProposed={(proposal) => {
            onProposed(proposal);
            onOpenChange(false);
          }}
          onReplace={(match) => {
            onOpenChange(false);
            onReplace(match);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
