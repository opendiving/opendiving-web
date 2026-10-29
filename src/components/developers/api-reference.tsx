"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import "./scalar-theme.css";

import { SectionSpinner } from "@/components/ui/section-spinner";
import { API_BASE_URL } from "@/lib/api-base";
import { CredentialFilter } from "./credential-filter";
import {
  type Credential,
  filterByCredential,
  namesCredentials,
} from "@/lib/openapi-credentials";

type OpenApiDocument = Record<string, unknown>;

/**
 * This instance's OpenAPI document, rendered by Scalar with its request client.
 *
 * Requests go wherever the app's own calls go: the server is the origin of
 * `API_BASE_URL`, which is this page's origin unless the build split the API off.
 *
 * The page fetches the document itself and hands Scalar the result, so a reader can cut it down
 * to the routes one credential may call. The selector stays hidden when the document names no
 * credentials, and when the fetch fails Scalar is given the URL and reports the failure itself.
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

  const [apiBase] = useState(() => new URL(API_BASE_URL, window.location.href));
  const documentUrl = `${apiBase.href.replace(/\/$/, "")}/openapi.json`;

  const [spec, setSpec] = useState<OpenApiDocument | "failed" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [credential, setCredential] = useState<Credential | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetch(documentUrl)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<OpenApiDocument>;
      })
      .then((body) => !cancelled && setSpec(body))
      .catch(() => !cancelled && setSpec("failed"));
    return () => {
      cancelled = true;
    };
  }, [documentUrl]);

  const filterable =
    typeof spec === "object" && spec !== null && namesCredentials(spec);

  // Memoized: the wrapper calls `updateConfiguration` whenever the object changes.
  const configuration = useMemo(() => {
    const source =
      spec === "failed" || spec === null
        ? { url: documentUrl }
        : {
            content:
              filterable && credential !== "all"
                ? filterByCredential(spec, credential)
                : spec,
          };
    return {
      ...source,
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
  }, [apiBase, credential, darkMode, spec, documentUrl, filterable]);

  if (spec === null) return <SectionSpinner />;

  return (
    <div ref={containerRef} className="od-api-reference">
      {filterable && (
        <CredentialFilter
          container={containerRef}
          value={credential}
          onChange={setCredential}
        />
      )}
      {/* Keyed on the mode because Scalar reads `forceDarkModeState` once, at mount. */}
      <ApiReferenceReact
        key={darkMode ? "dark" : "light"}
        configuration={configuration}
      />
    </div>
  );
}
