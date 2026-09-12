"use client";

import { useEffect, useState } from "react";
import { LineChart } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { DiveProfileChart } from "@/components/dives/dive-profile-chart";
import {
  type Dive,
  type DiveProfile,
  type DiveProfileInfo,
  divesAPI,
} from "@/lib/api/dives";
import {
  diveRecordings,
  recordingDeviceLabel,
  recordingLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/error";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth, type UnitSystem } from "@/lib/units";

// What the card knows about the profile right now. `null` is "in flight", derived
// rather than stored - the same shape `useAuthedBlobUrl` uses, so nothing has to be
// set synchronously in an effect body just to mark the fetch as started.
//
// A single settled value rather than the `profile` + `hasFailed` pair this used to
// keep. Two independent states could disagree: `hasFailed` was never reset when the
// dive or the profile version changed, so one failure was permanent for the life of
// the page, and `profile` was never cleared, so a re-imported dive rendered the
// *previous* version's chart under the new sample count.
type ProfileResult =
  | { status: "ready"; profile: DiveProfile }
  // The API says this dive has no profile. Nothing to retry - re-asking returns the
  // same 404, and offering a retry button implies otherwise.
  | { status: "missing"; message: string }
  // A 401, a 5xx, or the network. Worth another go.
  | { status: "failed"; message: string };

interface DiveProfileCardProps {
  dive: Dive;
}

// What the dive computer recorded, from the summary the dive detail response
// already carries - so it is on screen before the series themselves have
// finished loading, and stays put when they fail.
//
// The marker count comes from `event_count` rather than from the loaded
// profile's `events.length` for that reason, and reads `> 0` rather than
// `!= null`: null is a profile extracted before the API recorded events at all
// and 0 is one that looked and found none, and neither is worth a sentence.
//
// So this count can exceed the ticks on the chart, and that is intended rather
// than a drift to fix. The API leaves an event past the profile's `duration`
// where the file put it - a FIT `user_marker` pressed after surfacing - and the
// DiveJSON spec blesses that (§6.4), rather than clamping. The chart clips
// those to its own x domain. **This line describes what the dive computer
// recorded; the chart describes what fits on the axis.** Reconciling them would
// mean either the card waiting on the series it deliberately doesn't wait for, or
// the chart drawing past its plot.
function describeProfileContents(
  info: DiveProfileInfo,
  units: UnitSystem,
): string {
  const parts = [
    `${info.depth_sample_count.toLocaleString()} depth samples recorded by the dive computer`,
  ];

  if (info.event_count && info.event_count > 0) {
    parts.push(
      `${info.event_count} ${info.event_count === 1 ? "marker" : "markers"}`,
    );
  }
  // Stated here as well as drawn, because a deco obligation is the one thing in
  // this card worth knowing without reading a chart.
  if (info.max_ceiling != null) {
    parts.push(
      `a deco ceiling to ${formatDepth(info.max_ceiling, units, { decimals: 1 })}`,
    );
  }

  return `${parts.join(", ")}.`;
}

// The dive's recorded curves - depth, temperature and tank pressure, the deco
// ceiling, and the six readouts its computer worked out for itself - on the dive
// detail page.
//
// Renders nothing when the dive has no profile - the same call as
// `DiveRecordingsCard`, and the opposite of `GasUseCard`: a dive logged by hand
// has no samples and never could, so there is nothing for the diver to act on
// and nothing worth an empty state. A dive that *does* have a recording always
// shows this if that recording carried samples.
//
// Needs no `onChanged` callback. Deleting a recording's last file deletes the
// recording with it (see the API's `delete_dive_file`), and the page's
// `refreshDive` already drops it from `dive.recordings` - which re-renders this
// card against what is left.
//
// **One chart, and a switcher rather than an overlay**, on a dive that two
// computers recorded. Subsurface's arrow keys switch too: two depth traces on
// one axis with two pressure families is a legend problem this app does not have
// to solve, and the question a diver actually asks is "what did *this* computer
// see", not "where do they disagree by a pixel".

export function DiveProfileCard({ dive }: DiveProfileCardProps) {
  const units = useUnits();
  const [result, setResult] = useState<ProfileResult | null>(null);
  // Bumped by the retry button to re-run the effect below.
  const [attempt, setAttempt] = useState(0);
  // Which recording's samples are on screen, by uuid rather than by index: a
  // deletion or a promotion reorders the list, and an index would quietly point
  // at a different device's curves afterwards.
  const [shownUuid, setShownUuid] = useState<string | null>(null);

  // Only recordings that actually carry samples: a recording whose files held
  // none has nothing to draw, and a switcher button leading to a permanent 404
  // is worse than not offering it.
  const charted = diveRecordings(dive).filter(
    (recording) => recording.profile != null,
  );
  // Falls back to the first charted recording - which is the primary wherever
  // the primary has a profile - whenever the chosen one is gone.
  const shown =
    charted.find((recording) => recording.uuid === shownUuid) ?? charted[0];

  const info = shown?.profile ?? null;
  const recordingUuid = shown?.uuid ?? null;
  const diveUuid = dive.uuid;
  // The profile's identity as far as the browser cache is concerned - the same
  // `uuid:updated_at` pair `DiveRecordingsCard` uses, and for the same reason.
  // `uuid` alone would not be enough if a row were ever updated in place, and
  // `updated_at` alone would not be enough here at all: re-extraction is a
  // delete-then-insert, so a re-extracted profile is a *new row* with a fresh
  // `uuid` and a null `updated_at`.
  const version = `${info?.uuid ?? ""}:${info?.updated_at ?? ""}`;

  useEffect(() => {
    if (!info || !recordingUuid) return;

    let isCurrent = true;
    const fetchProfile = async () => {
      try {
        const data = await divesAPI.getRecordingProfile(
          diveUuid,
          recordingUuid,
          version,
        );
        if (isCurrent) setResult({ status: "ready", profile: data });
      } catch (error) {
        console.error("Failed to fetch dive profile:", error);
        if (!isCurrent) return;
        // A muted line in the card rather than a toast: nothing the diver did
        // caused this and there is nothing for them to do about it, so it
        // belongs where the chart would have been, not over the whole page.
        //
        // The API's own wording where it has one - "This dive has no profile" -
        // now that the response interceptor unwraps blob-wrapped error bodies.
        const status =
          (error as { response?: { status?: number } })?.response?.status ===
          404
            ? "missing"
            : "failed";
        setResult({
          status,
          message: getApiErrorMessage(
            error,
            "This recording's profile couldn't be loaded.",
          ),
        });
      }
    };

    fetchProfile();
    return () => {
      isCurrent = false;
      // Back to "in flight" for whatever comes next. This is what stops a stale
      // chart or a stale failure surviving a dive change or a re-import.
      setResult(null);
    };
    // `info` itself is a fresh object on every dive refetch; its `updated_at` is
    // what actually identifies the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diveUuid, recordingUuid, version, Boolean(info), attempt]);

  if (!info || !shown) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <LineChart className="h-5 w-5" />
          Dive Profile
        </CardTitle>
        <CardDescription>
          {describeProfileContents(info, units)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {charted.length > 1 && (
          // A named group rather than loose buttons: these are one control with
          // several settings, and a screen reader meeting them in the middle of
          // a card otherwise hears a row of device names with nothing saying
          // what choosing one does.
          <div
            role="group"
            aria-label="Which recording to chart"
            data-testid="profile-recording-switcher"
            className="mb-4 flex flex-wrap gap-2"
          >
            {charted.map((recording) => {
              const isShown = recording.uuid === shown.uuid;
              return (
                <Button
                  key={recording.uuid}
                  type="button"
                  variant={isShown ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={isShown}
                  className={cn(isShown && "font-semibold")}
                  onClick={() => setShownUuid(recording.uuid)}
                >
                  {recordingDeviceLabel(recording.device) ??
                    `${UNNAMED_DEVICE_LABEL} · ${recordingLabel(recording)}`}
                </Button>
              );
            })}
          </div>
        )}
        {result === null ? (
          <SectionSpinner />
        ) : result.status === "ready" ? (
          <DiveProfileChart profile={result.profile} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {/* Only for the transient case. A 404 means this dive genuinely has
                no profile, and a retry button there would just fail again. */}
            {result.status === "failed" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
