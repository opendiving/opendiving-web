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
import { SectionSpinner } from "@/components/ui/section-spinner";
import { DiveProfileChart } from "@/components/dives/dive-profile-chart";
import { type Dive, type DiveProfile, divesAPI } from "@/lib/api/dives";

interface DiveProfileCardProps {
  dive: Dive;
}

// The dive's recorded depth/temperature/tank-pressure curves, on the dive detail
// page.
//
// Renders nothing when the dive has no profile - the same call as
// `DiveSourceFileCard`, and the opposite of `GasUseCard`: a dive logged by hand
// has no samples and never could, so there is nothing for the diver to act on
// and nothing worth an empty state. A dive that *does* have an imported file
// always shows this if the file carried samples.
//
// Needs no `onChanged` callback. Deleting the source file deletes the profile
// with it (see the API's `delete_dive_file`), and the page's `refreshDive`
// already drops `dive.profile` - which unmounts this card.
export function DiveProfileCard({ dive }: DiveProfileCardProps) {
  const [profile, setProfile] = useState<DiveProfile | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  const info = dive.profile;
  const diveUuid = dive.uuid;
  // The profile's identity as far as the browser cache is concerned - the same
  // `uuid:updated_at` pair `DiveSourceFileCard` uses, and for the same reason.
  // `uuid` alone would not be enough if a row were ever updated in place, and
  // `updated_at` alone would not be enough here at all: re-extraction is a
  // delete-then-insert, so a re-extracted profile is a *new row* with a fresh
  // `uuid` and a null `updated_at`.
  const version = `${info?.uuid ?? ""}:${info?.updated_at ?? ""}`;

  useEffect(() => {
    if (!info) return;

    let isCurrent = true;
    const fetchProfile = async () => {
      try {
        const data = await divesAPI.getDiveProfile(diveUuid, version);
        if (isCurrent) setProfile(data);
      } catch (error) {
        console.error("Failed to fetch dive profile:", error);
        // A muted line in the card rather than a toast: nothing the diver did
        // caused this and there is nothing for them to do about it, so it
        // belongs where the chart would have been, not over the whole page.
        if (isCurrent) setHasFailed(true);
      }
    };

    fetchProfile();
    return () => {
      isCurrent = false;
    };
    // `info` itself is a fresh object on every dive refetch; its `updated_at` is
    // what actually identifies the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diveUuid, version, Boolean(info)]);

  if (!info) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChart className="h-5 w-5" />
          Dive Profile
        </CardTitle>
        <CardDescription>
          {info.depth_sample_count.toLocaleString()} depth samples recorded by
          the dive computer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasFailed ? (
          <p className="text-sm text-muted-foreground">
            This dive&apos;s profile couldn&apos;t be loaded.
          </p>
        ) : profile === null ? (
          <SectionSpinner />
        ) : (
          <DiveProfileChart profile={profile} />
        )}
      </CardContent>
    </Card>
  );
}
