"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { getApiErrorMessage } from "@/lib/api/error";
import { storageAPI, type StorageUsage } from "@/lib/api/storage";
import { formatFileSize } from "@/lib/format";

type UsageState =
  | { status: "loading" }
  | { status: "ready"; usage: StorageUsage }
  | { status: "failed"; message: string };

const LOAD_FAILED = "Couldn't load what your account is storing.";

// What the account's uploads take up against the instance's limit, and by kind,
// so a diver near the limit can see what to delete. With no limit set there is
// no bar, only the totals.
export function StorageCard() {
  const [state, setState] = useState<UsageState>({ status: "loading" });

  // A promise chain rather than `async`/`await`, for the reason `SessionsCard`
  // gives: `react-hooks/set-state-in-effect` rejects a synchronous-looking
  // setState in the effect below.
  const refresh = useCallback(
    () =>
      storageAPI
        .getUsage()
        .then((usage) => setState({ status: "ready", usage }))
        .catch((error: unknown) => {
          console.error(LOAD_FAILED, error);
          setState({
            status: "failed",
            message: getApiErrorMessage(error, LOAD_FAILED),
          });
        }),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage
        </CardTitle>
        <CardDescription>
          The space your uploaded files take up on this copy of OpenDiving.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "loading" && <SectionSpinner />}

        {state.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {state.status === "ready" && <UsageDetails usage={state.usage} />}
      </CardContent>
    </Card>
  );
}

function UsageDetails({ usage }: { usage: StorageUsage }) {
  const used = formatFileSize(usage.used_bytes);
  const limit =
    usage.limit_bytes === null ? null : formatFileSize(usage.limit_bytes);
  const kinds = [
    { label: "Dive-computer files", bytes: usage.dive_files_bytes },
    { label: "Certification cards", bytes: usage.certification_files_bytes },
    { label: "Profile picture and portrait", bytes: usage.pictures_bytes },
  ];

  return (
    <div className="space-y-4">
      {usage.limit_bytes === null ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">{used} used</p>
          <p className="text-sm text-muted-foreground">
            This copy of OpenDiving sets no storage limit.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {used} of {limit} used
          </p>
          <Meter
            value={usage.used_bytes}
            max={usage.limit_bytes}
            valueText={`${used} of ${limit} used`}
            aria-label="Storage used"
          />
          {usage.used_bytes > usage.limit_bytes && (
            <p className="text-sm text-destructive">
              Your account is over its storage limit, so an upload that adds to
              it is refused until something is removed.
            </p>
          )}
        </div>
      )}

      <dl className="divide-y rounded-lg border text-sm">
        {kinds.map(({ label, bytes }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">
              {formatFileSize(bytes)}
            </dd>
          </div>
        ))}
      </dl>

      {/* The recording lists print each file's size as uploaded, and a diver
          comparing the two would otherwise read the difference as an error. */}
      <p className="text-sm text-muted-foreground">
        Dive-computer files are stored compressed, so they count for less here
        than the sizes listed on your dives. A file uploaded before compression
        was introduced counts at its full size.
      </p>
    </div>
  );
}
