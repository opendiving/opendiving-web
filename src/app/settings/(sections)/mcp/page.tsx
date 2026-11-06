import type { Metadata } from "next";

import { McpSection } from "@/components/settings/mcp-section";
import { pageTitle } from "@/lib/page-title";
import { runtimeConfig } from "@/lib/runtime-config";

export const metadata: Metadata = {
  title: { absolute: pageTitle("MCP", "Settings") },
};

// See "A page under an auth-gate layout opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function McpSettingsPage() {
  const serverUrl = new URL("/api/v1/mcp", runtimeConfig().siteUrl).href;
  return <McpSection serverUrl={serverUrl} />;
}
