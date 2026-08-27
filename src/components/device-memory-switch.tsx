"use client";

import { useId, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  isOptedOut,
  isOptedOutOnServer,
  setOptOut,
  subscribeToOptOut,
} from "@/lib/device-memory";

// Must match `defaultTheme` on the provider in `app/layout.tsx`. Turning the
// switch on settles this tab on it: a same-document `removeItem` fires no
// `storage` event and next-themes has no other change detection, so without
// this the tab the diver flipped the switch in would keep its in-memory theme
// until reload while every other open tab reverted at once.
const DEFAULT_THEME = "system";

/**
 * The device-memory objection switch, rendered by both surfaces that offer it -
 * `/privacy` §10.3 and the `/settings` device card.
 *
 * One component rather than one per surface, and the only consumer of
 * `lib/device-memory.ts`'s read/subscribe/set API: the read path exists once, so
 * the two surfaces cannot drift apart, and a change made on either is what the
 * other reads on next render.
 *
 * `useSyncExternalStore` renders a stable server-side answer and resolves the
 * real one after hydration, the same pattern every storage consumer here uses.
 */
export function DeviceMemorySwitch() {
  const id = useId();
  const { setTheme } = useTheme();
  const optedOut = useSyncExternalStore(
    subscribeToOptOut,
    isOptedOut,
    isOptedOutOnServer,
  );

  const handleChange = (next: boolean) => {
    setOptOut(next);

    // The theme settle belongs here rather than in the module: this renders
    // under the root `ThemeProvider` and can reach its `setTheme`, and the
    // module stays React-free. The write inside this call is dropped by the
    // interposition, which is the point - the visible result is uniform across
    // tabs immediately, and nothing is stored.
    if (next) setTheme(DEFAULT_THEME);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 not-prose">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          className="mt-1"
          checked={optedOut}
          onChange={(event) => handleChange(event.target.checked)}
        />
        <div>
          <Label htmlFor={id} className="cursor-pointer font-normal">
            Don&rsquo;t remember display preferences on this device
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Turning this on clears the preferences already stored here and stops
            new ones being written &mdash; the theme, the chart and dashboard
            views, the entry units and the passkey dismissal. The theme goes
            back to whatever your system is set to straight away, in this tab
            and any other you have open, since leaving it looking remembered
            would be the misleading thing. The rest keep working until you
            reload, and start fresh after it. Turning this back off restores
            nothing, it only lets choices be remembered again.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            This travels with the browser, not with your account, so it is a
            separate answer on every device you use.
          </p>
        </div>
      </div>
    </div>
  );
}
