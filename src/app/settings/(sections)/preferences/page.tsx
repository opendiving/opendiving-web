import { DeviceMemoryCard } from "@/components/settings/device-memory-card";
import { UnitsCard } from "@/components/settings/units-card";

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function PreferencesSettingsPage() {
  return (
    <>
      <UnitsCard />
      <DeviceMemoryCard />
    </>
  );
}
