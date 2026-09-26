import { redirect } from "next/navigation";

// `/settings` is the section, not a screen. Emails already sent link here, so it keeps
// answering, with the first section - a server redirect, so the browser never mounts a
// page it is about to leave, and the destination's layout does the auth gating.
export default function SettingsPage() {
  redirect("/settings/account");
}
