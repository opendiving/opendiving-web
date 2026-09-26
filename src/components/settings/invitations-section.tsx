"use client";

import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { InvitationsCard } from "@/components/settings/invitations-card";

export function InvitationsSection() {
  const { config } = useInstanceConfig();

  // The menu leaves this section out on such an instance, and the card removes itself
  // there too, so a diver who reaches the URL anyway is told why the page is empty.
  if (config?.registration_mode === "open") {
    return (
      <p className="text-muted-foreground">
        Anyone can create an account on this copy of OpenDiving, so there is
        nobody to invite.
      </p>
    );
  }

  return <InvitationsCard />;
}
