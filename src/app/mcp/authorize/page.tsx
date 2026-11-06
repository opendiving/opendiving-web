import type { Metadata } from "next";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import { McpConsentPage } from "@/components/settings/mcp-consent-page";

export const metadata: Metadata = {
  title: "Connect an application",
  robots: { index: false, follow: false },
};
export const instant = false;

export default function AuthorizePage() {
  return (
    <StandaloneShell className="max-w-3xl">
      <McpConsentPage />
    </StandaloneShell>
  );
}
