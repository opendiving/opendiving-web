"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plug, ShieldCheck } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { mcpAPI, type McpConsent } from "@/lib/api/mcp";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { McpPermissions } from "@/components/settings/mcp-permissions";
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
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-teal/20 bg-teal/5">
            <Plug className="h-6 w-6 text-teal" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight">
              Connect {state.consent.name}
            </h1>
            <p className="break-words text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>
        </div>
        <CardDescription>
          Choose what this application can access in your OpenDiving account.
          Only the permissions you approve will be granted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <McpPermissions
          scopes={state.consent.scopes}
          selected={state.selected}
          disabled={busy}
          onChange={(selected) =>
            setState((current) =>
              current.status === "ready" ? { ...current, selected } : current,
            )
          }
        />
        <details className="rounded-md border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Application details
          </summary>
          <dl className="mt-3 space-y-3 text-muted-foreground">
            <div>
              <dt className="font-medium text-foreground">Application ID</dt>
              <dd className="mt-1 break-all">{state.consent.client_id}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Return address</dt>
              <dd className="mt-1 break-all">{state.consent.redirect_uri}</dd>
            </div>
          </dl>
        </details>
        <StatusMessage variant="error">{error}</StatusMessage>
      </CardContent>
      <div className="space-y-4 border-t bg-muted/30 p-5 sm:p-6">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          You can revoke this application&apos;s access at any time in MCP
          settings.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="sm:mr-auto"
            disabled={busy}
            onClick={() => void decide([])}
          >
            Deny
          </Button>
          <Button
            variant="outline"
            disabled={busy || state.consent.scopes.length === 0}
            onClick={() => void decide(state.consent.scopes)}
          >
            Allow all
          </Button>
          <Button
            disabled={busy || state.selected.length === 0}
            onClick={() => void decide(state.selected)}
          >
            Allow selected permissions
          </Button>
        </div>
      </div>
    </Card>
  );
}
