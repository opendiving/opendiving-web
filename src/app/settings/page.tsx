import { redirect } from "next/navigation";

// `/settings` is the section, not a screen. The API's emails link here, and emails
// already delivered go on doing so whatever later ones link to, so it keeps answering
// with the first section. A server redirect, so the browser never mounts a page it is
// about to leave, and the destination's layout does the auth gating.
export default function SettingsPage() {
  redirect("/settings/account");
}
