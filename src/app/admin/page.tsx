import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Admin" };

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

const SCREENS = [
  {
    href: "/admin/invites",
    icon: Inbox,
    title: "Invite Queue",
    description:
      "Addresses that have asked for an invitation to this instance.",
  },
  {
    href: "/admin/stats",
    icon: BarChart3,
    title: "Stats",
    description:
      "Daily totals of accounts created, sign-ins and active accounts.",
  },
];

/**
 * `/admin` is the section's landing, and the header's Admin entry lands here: the
 * one place every screen in the section is offered from. Guarded by the same
 * layout as the screens themselves, so a signed-out visitor is bounced to
 * `/signin` and a diver who is not a superuser sees the not-found state.
 */
export default function AdminPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {SCREENS.map(({ href, icon: Icon, title, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
