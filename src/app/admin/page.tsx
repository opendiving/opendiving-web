import { redirect } from "next/navigation";

/**
 * `/admin` is the section, not a screen. It sends the operator to the one screen
 * the section currently has.
 *
 * A server redirect rather than a client one, so the browser never mounts a page
 * it is about to leave - and the destination is guarded by the same layout this
 * path is, so the redirect discloses nothing: a signed-out visitor lands on
 * `/admin/invites` and is bounced to `/signin` from there.
 *
 * When a second screen exists this becomes a landing page or a nav; until then a
 * section with one entry does not need one.
 */
export default function AdminPage() {
  redirect("/admin/invites");
}
