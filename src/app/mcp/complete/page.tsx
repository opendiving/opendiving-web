import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";

import { StandaloneShell } from "@/components/layout/standalone-shell";
import {
  StandaloneCard,
  StandaloneCardHeader,
} from "@/components/layout/standalone-card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authorization complete",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function McpCompletePage() {
  return (
    <StandaloneShell className="text-center">
      <StandaloneCard>
        <StandaloneCardHeader
          icon={CircleCheck}
          iconClassName="text-success"
          title="Authorization complete"
          description="Return to your application to finish connecting to OpenDiving. You can close this tab."
        />
        <div className="space-y-4">
          <ButtonLink href="/settings/mcp" className="w-full">
            Manage connected applications
          </ButtonLink>
          <p className="text-xs leading-relaxed text-muted-foreground">
            You can review permissions and revoke access at any time in MCP
            settings.
          </p>
        </div>
      </StandaloneCard>
    </StandaloneShell>
  );
}
