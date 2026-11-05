import type { Metadata } from "next";
import { BarChart3, Fish, Inbox } from "lucide-react";
import { AdminScreenCard } from "@/components/admin/admin-screen-card";
import { ProposalScreenCard } from "@/components/admin/proposal-screen-card";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

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
  {
    href: "/admin/species",
    icon: Fish,
    title: "Species",
    description:
      "The species catalog, and the photo each one shows: hide, replace or re-fetch it.",
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
    <div>
      <IndexHero title="Admin" />

      <div className={HERO_BODY}>
        <ul className="grid gap-4 max-sm:gap-2.5 sm:grid-cols-2">
          {SCREENS.map((screen) => (
            <li key={screen.href}>
              <AdminScreenCard {...screen} />
            </li>
          ))}
          <ProposalScreenCard />
        </ul>
      </div>
    </div>
  );
}
