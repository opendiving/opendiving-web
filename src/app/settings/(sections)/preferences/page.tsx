import type { Metadata } from "next";

import { DeviceMemoryCard } from "@/components/settings/device-memory-card";
import { DiveComputersCard } from "@/components/settings/dive-computers-card";
import { TagsCard } from "@/components/settings/tags-card";
import { UnitsCard } from "@/components/settings/units-card";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Preferences", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function PreferencesSettingsPage() {
  return (
    <>
      <UnitsCard />
      <TagsCard />
      <DeviceMemoryCard />
      {/* Last, since it appears only once its list has loaded. */}
      <DiveComputersCard />
    </>
  );
}
