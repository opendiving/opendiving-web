"use client";

import { installDeviceMemorySuppression } from "@/lib/device-memory";

// Arms the device-memory switch's write suppression, and exists only to do so.
//
// **The install is a module-evaluation side effect, not an effect and not a
// render.** Two dashboard cards write their view keys from a mount effect with
// no interaction at all - `dives/gas-use-card.tsx` and
// `dives/dive-activity-card.tsx`, as soon as their series arrives - and React
// runs child effects before parent effects, so an install from a provider's own
// effect would land after those writes. Evaluating the module is what installs,
// so the interposition is armed as soon as the route's client bundle loads.
//
// **It is a component the root layout renders, rather than an import the root
// layout makes.** `app/layout.tsx` is an async Server Component: a module
// without `"use client"` compiles into the server graph alone, and even one
// that has it can have a bare side-effect-only import dropped from the route's
// client entry. `/privacy` and `/settings` would pull this in anyway through
// the switch itself, so that failure would have shown up on `/dashboard` alone
// - exactly where the two mount-effect writers are.
//
// A side-effect import bolted onto `theme-provider.tsx` was the smaller diff
// and was rejected for hiding a global storage interposition inside a component
// that reads as theme-only: a later contributor reordering or replacing the
// theme wrapper would disarm the switch silently. This file's whole job is to
// be conspicuous.
installDeviceMemorySuppression();

export function DeviceMemoryInstaller() {
  return null;
}
