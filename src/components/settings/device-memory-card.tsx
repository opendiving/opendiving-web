"use client";

import { MonitorCog } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeviceMemorySwitch } from "@/components/device-memory-switch";

/**
 * The `/settings` mirror of the switch that `/privacy` §10.3 carries.
 *
 * Every other card on this page is account state, saved through the API and the
 * same on every browser you sign in from. This one is not, and the description
 * says so before the control rather than after it - a device setting sitting
 * among account settings that did not announce itself would read as an account
 * setting that had stopped syncing.
 *
 * `/privacy` is the load-bearing surface, because this page is auth-gated and
 * the objection has to work signed out: the theme is writable with no session,
 * and keys stored during an earlier signed-in visit outlive the sign-out. This
 * mirror is here for discoverability, and renders the same shared control.
 */
export function DeviceMemoryCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <MonitorCog className="h-5 w-5" />
          This device
        </CardTitle>
        <CardDescription>
          Kept in this browser rather than on your account, so it is a separate
          answer on every device you sign in from.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeviceMemorySwitch />
      </CardContent>
    </Card>
  );
}
