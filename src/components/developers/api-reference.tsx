"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import "./scalar-theme.css";

import { API_BASE_URL } from "@/lib/api-base";

/**
 * This instance's OpenAPI document, rendered by Scalar with its request client.
 *
 * Requests go wherever the app's own calls go: the server is the origin of
 * `API_BASE_URL`, which is this page's origin unless the build split the API off.
 *
 * Everything that talks to Scalar's service is off - telemetry, the AI agent, the
 * developer toolbar, the hosted-client button - and `persistAuth` is off so a pasted token or API key lives
 * in memory only, as the app's own access token does. Theme and dark mode follow
 * the app: the colours come from `scalar-theme.css`, the mode from next-themes,
 * and Scalar's own toggle is hidden so it never writes a `colorMode` storage key.
 */
export function ApiReference() {
  const { resolvedTheme } = useTheme();
  const darkMode = resolvedTheme === "dark";

  // Memoized: the wrapper calls `updateConfiguration` whenever the object changes.
  const configuration = useMemo(() => {
    const apiBase = new URL(API_BASE_URL, window.location.href);
    return {
      url: `${apiBase.href.replace(/\/$/, "")}/openapi.json`,
      servers: [{ url: apiBase.origin }],
      telemetry: false,
      agent: { disabled: true },
      showDeveloperTools: "never" as const,
      // The button hands this document's URL to client.scalar.com.
      hideClientButton: true,
      persistAuth: false,
      withDefaultFonts: false,
      hideDarkModeToggle: true,
      forceDarkModeState: darkMode ? ("dark" as const) : ("light" as const),
      authentication: { preferredSecurityScheme: "bearer" },
    };
  }, [darkMode]);

  return (
    <div className="od-api-reference">
      {/* Keyed on the mode because Scalar reads `forceDarkModeState` once, at mount. */}
      <ApiReferenceReact
        key={darkMode ? "dark" : "light"}
        configuration={configuration}
      />
    </div>
  );
}
