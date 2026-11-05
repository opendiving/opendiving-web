"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";

import { AdminScreenCard } from "@/components/admin/admin-screen-card";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { adminAPI } from "@/lib/api/admin";
import { countNoun } from "@/lib/format";

// The queue's entry on `/admin`, only where the Commons is edited, with how many
// proposals wait. The one row asked for is what the count comes with.
export function ProposalScreenCard() {
  const { config } = useInstanceConfig();
  const isPrimary = config?.commons_primary === true;
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!isPrimary) return;
    let active = true;
    adminAPI
      .getDiveSiteProposals(1, 1)
      .then(({ total_count }) => {
        if (active) setWaiting(total_count);
      })
      .catch((error: unknown) => {
        console.error("Couldn't count the waiting proposals.", error);
      });
    return () => {
      active = false;
    };
  }, [isPrimary]);

  if (!isPrimary) return null;

  return (
    <li>
      <AdminScreenCard
        href="/admin/proposals"
        icon={Landmark}
        title="Commons Proposals"
        description={
          waiting === null
            ? "Dive sites and changes proposed for OpenDiving Commons."
            : `${countNoun(waiting, "proposal")} waiting for review.`
        }
      />
    </li>
  );
}
