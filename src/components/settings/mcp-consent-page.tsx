"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { mcpAPI, type McpConsent } from "@/lib/api/mcp";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";

type ConsentState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; consent: McpConsent; selected: string[] };

export function McpConsentPage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const request = useSearchParams().get("request") ?? "";

  if (isLoading || !isAuthenticated || !user) return <SectionSpinner />;

  return (
    <ConsentForm
      key={JSON.stringify([user.uuid, request])}
      request={request}
      email={user.email}
    />
  );
}

interface ConsentFormProps {
  request: string;
  email: string;
}

function ConsentForm({ request, email }: ConsentFormProps) {
  const [state, setState] = useState<ConsentState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    mcpAPI
      .getConsent(request)
      .then((consent) => {
        if (active)
          setState({
            status: "ready",
            consent,
            selected: consent.scopes.filter((scope) => scope.endsWith(":read")),
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            status: "failed",
            message: getApiErrorMessage(
              cause,
              "This connection request is unavailable or has expired.",
            ),
          });
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [request]);

  async function decide(scopes: string[]) {
    setBusy(true);
    setError("");
    try {
      const callback = await mcpAPI.decideConsent(request, scopes);
      if (mounted.current) window.location.assign(callback);
    } catch (cause: unknown) {
      if (!mounted.current) return;
      setError(getApiErrorMessage(cause, "Couldn't complete this connection."));
      setBusy(false);
    }
  }

  if (state.status === "loading") return <SectionSpinner />;
  if (state.status === "failed")
    return <StatusMessage variant="error">{state.message}</StatusMessage>;

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Connect {state.consent.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Signed in as {email}</p>
          <CardDescription>
            Select what this application may do with your OpenDiving account.
            You can revoke access in MCP settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm">
            <p className="break-all">
              Application ID: {state.consent.client_id}
            </p>
            <p className="break-all">
              Return address: {state.consent.redirect_uri}
            </p>
            <p>
              Only approve applications you trust. Write permissions allow
              changes; delete permissions allow permanent removal.
            </p>
          </div>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-3 font-medium">Requested permissions</legend>
            {state.consent.scopes.map((scope) => (
              <label key={scope} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={state.selected.includes(scope)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setState((current) =>
                      current.status === "ready"
                        ? {
                            ...current,
                            selected: checked
                              ? [...current.selected, scope]
                              : current.selected.filter(
                                  (item) => item !== scope,
                                ),
                          }
                        : current,
                    );
                  }}
                />
                {scope.replace(/:/g, ": ").replace(/-/g, " ")}
              </label>
            ))}
          </fieldset>
          <StatusMessage variant="error">{error}</StatusMessage>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void decide([])}
            >
              Deny
            </Button>
            <Button
              disabled={busy || state.selected.length === 0}
              onClick={() => void decide(state.selected)}
            >
              Allow selected permissions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
