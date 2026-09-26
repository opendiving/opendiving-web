"use client";

import { DeviceMemoryCard } from "@/components/settings/device-memory-card";
import { UnitsCard } from "@/components/settings/units-card";

export default function PreferencesSettingsPage() {
  return (
    <>
      <UnitsCard />
      <DeviceMemoryCard />
    </>
  );
}
