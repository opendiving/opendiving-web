import { redirect } from "next/navigation";

// `/settings` is the section, not a screen. The API's emails link here, so it keeps
// answering with the first section until each of those links names the section it
// means - which it can only once this build is live, since an older one has no such
// paths. A server redirect, so the browser never mounts a page it is about to leave,
// and the destination's layout does the auth gating.
export default function SettingsPage() {
  redirect("/settings/account");
}
