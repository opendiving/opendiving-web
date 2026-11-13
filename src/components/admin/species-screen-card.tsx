"use client";

import { useEffect, useState } from "react";
import { Fish } from "lucide-react";

import { AdminScreenCard } from "@/components/admin/admin-screen-card";
import { adminAPI } from "@/lib/api/admin";
import { countNoun } from "@/lib/format";

const DESCRIPTION =
  "The species catalog, and the photo each one shows: hide, replace or re-fetch it.";

// The catalog's entry on `/admin`, with how many species have a photo proposal
// waiting, read as the Proposed chip reads it.
export function SpeciesScreenCard() {
  const [proposed, setProposed] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    adminAPI.countSpeciesWithPhotoProposals().then(
      (count) => {
        if (active) setProposed(count);
      },
      (error: unknown) => {
        console.error("Couldn't count the species with a proposal.", error);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <li>
      <AdminScreenCard
        href="/admin/species"
        icon={Fish}
        title="Species"
        description={
          proposed === null
            ? DESCRIPTION
            : `${DESCRIPTION} ${countNoun(proposed, "species", "species")} with a photo proposal waiting.`
        }
      />
    </li>
  );
}
