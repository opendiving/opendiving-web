"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, LinkIcon } from "lucide-react";

import {
  fetchSharedCheckIn,
  type SharedCheckIn,
} from "@/lib/api/checkin-links";
import { divingFiguresFromWire } from "@/lib/checkin";
import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/page-spinner";

type Loaded =
  | { status: "loading" }
  | { status: "live"; summary: SharedCheckIn }
  | { status: "gone" }
  | { status: "failed" };

// The page a check-in link opens, for whoever holds it - a desk's phone, with no
// account. It never asks who is signed in: the token is the whole credential, and the
// frame it draws is the diver's own sheet with every control that edits taken off.
export function SharedCheckInPage({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // A promise chain for `react-hooks/set-state-in-effect`, as the other loaders here.
  useEffect(() => {
    const controller = new AbortController();
    fetchSharedCheckIn(token, controller.signal)
      .then((summary) => {
        if (controller.signal.aborted) return;
        setLoaded(summary ? { status: "live", summary } : { status: "gone" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load the shared check-in page:", error);
        setLoaded({ status: "failed" });
      });
    return () => controller.abort();
  }, [token, attempt]);

  if (loaded.status === "loading") return <PageSpinner variant="inset" />;

  // Expired, revoked and never-existed read the same, because the API answers them
  // the same: which one it was would tell a stranger something about the diver.
  if (loaded.status === "gone") {
    return (
      <Notice icon={<LinkIcon className="h-6 w-6 text-muted-foreground" />}>
        <h1 className="text-2xl font-semibold">
          This check-in link is no longer valid
        </h1>
        <p className="text-muted-foreground">
          It has expired or was revoked. Ask the diver for a new one.
        </p>
      </Notice>
    );
  }

  if (loaded.status === "failed") {
    return (
      <Notice
        icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
      >
        <h1 className="text-2xl font-semibold">
          This check-in page didn&rsquo;t load
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoaded({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </Notice>
    );
  }

  const { summary } = loaded;
  const contactNames: Record<string, string> = {};
  for (const card of summary.certifications) {
    if (card.contact_name) contactNames[card.uuid] = card.contact_name;
  }

  return (
    <CheckInPageFrame
      diver={summary.diver}
      units={summary.diver.units}
      certifications={summary.certifications}
      contactNames={contactNames}
      isLoading={false}
      link={{
        token,
        expiresAt: summary.expires_at,
        diving: divingFiguresFromWire(summary.diving),
      }}
    />
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      {icon}
      {children}
    </div>
  );
}
