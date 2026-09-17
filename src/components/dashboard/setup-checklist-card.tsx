"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { certificationsAPI } from "@/lib/api/certifications";
import { gearAPI } from "@/lib/api/gear";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SetupChecklistCardProps {
  // The diver's dive count, straight from the dashboard's `/user/dive-stats` call
  // rather than re-fetched here. `null` while that request is still in flight, which
  // holds the card back - a checklist that renders "0 dives logged" for a moment and
  // then vanishes is worse than one that appears a beat late.
  totalDives: number | null;
}

interface ChecklistStep {
  key: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

// The first-run checklist, built from what the diver has actually logged.
//
// It replaces a hard-coded three-item panel that always read "0/3 - Pending - Optional"
// no matter what was in the account, and pointed at a "Join Community" step the app has
// no such thing as. Every step here is a real count from a real endpoint, and the card
// removes itself for good once all three are done - so an established logbook doesn't
// carry a permanent onboarding widget.
//
// The two counts it needs are fetched with `items_per_page: 1`: only `total_count` is
// read, and nothing here renders the rows themselves.
export function SetupChecklistCard({
  totalDives,
}: SetupChecklistCardProps) {
  const [gearCount, setGearCount] = useState<number | null>(null);
  const [certificationCount, setCertificationCount] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      gearAPI.getGearItems(1, 1),
      certificationsAPI.getCertifications(1, 1),
    ])
      .then(([gear, certifications]) => {
        if (cancelled) return;
        setGearCount(gear.total_count);
        setCertificationCount(certifications.total_count);
      })
      // Same reasoning as `ServiceDueCard`: this is a supplementary card, and a failed
      // fetch leaves it unrendered rather than turning the dashboard into an error page.
      .catch((error) =>
        console.error("Failed to load setup checklist counts:", error),
      );

    return () => {
      cancelled = true;
    };
  }, []);

  if (
    totalDives === null ||
    gearCount === null ||
    certificationCount === null
  ) {
    return null;
  }

  const steps: ChecklistStep[] = [
    {
      key: "dive",
      label: "Log your first dive",
      description: "By hand, or by dropping in a dive-computer export",
      href: "/dives/new",
      done: totalDives > 0,
    },
    {
      key: "gear",
      label: "Add your gear",
      description: "So dives record what you dived, and service stays tracked",
      href: "/gear",
      done: gearCount > 0,
    },
    {
      key: "certification",
      label: "Store your c-cards",
      description: "Photos of your certifications, on hand at the dive shop",
      href: "/certifications",
      done: certificationCount > 0,
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          as="h2"
          className="flex items-center justify-between gap-3 text-base"
        >
          <span>Getting started</span>
          <Badge variant="secondary">
            {doneCount}/{steps.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Three things worth setting up. This card disappears once they&apos;re
          done.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
          >
            {step.done ? (
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div
                className={
                  step.done
                    ? "text-sm font-medium text-muted-foreground line-through"
                    : "text-sm font-medium"
                }
              >
                {step.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {step.description}
              </div>
            </div>
            {!step.done && (
              <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
