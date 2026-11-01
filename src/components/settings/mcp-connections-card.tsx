"use client";

import { useState } from "react";
import { mcpAPI, type McpConnection } from "@/lib/api/mcp";
import { getApiErrorMessage } from "@/lib/api/error";
import { useOptionalList } from "@/hooks/useOptionalList";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";

const loadConnections = () => mcpAPI.getConnections();

export function McpConnectionsCard() {
  const { list, update } = useOptionalList(
    loadConnections,
    "Couldn't load connected applications.",
  );
  const [selected, setSelected] = useState<McpConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function revoke() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await mcpAPI.revokeConnection(selected.uuid);
      update((connections) =>
        connections.filter((connection) => connection.uuid !== selected.uuid),
      );
      setSelected(null);
    } catch (cause: unknown) {
      setError(getApiErrorMessage(cause, "Couldn't revoke this connection."));
    } finally {
      setBusy(false);
    }
  }

  if (list.status === "absent") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected applications</CardTitle>
        <CardDescription>
          Apps and AI assistants connected through MCP. Revoking a connection
          stops its access and refresh tokens immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.status === "loading" && <SectionSpinner />}
        {list.status === "failed" && (
          <StatusMessage variant="error">{list.message}</StatusMessage>
        )}
        {list.status === "ready" && list.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No connected applications.
          </p>
        )}
        {list.status === "ready" &&
          list.data.map((connection) => (
            <div
              key={connection.uuid}
              className="flex items-start justify-between gap-4 border-b pb-4 last:border-0"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{connection.name}</p>
                <p className="break-all text-sm text-muted-foreground">
                  {connection.client_id}
                </p>
                <p className="text-sm">{connection.scopes.join(", ")}</p>
              </div>
              <Button variant="outline" onClick={() => setSelected(connection)}>
                Revoke
              </Button>
            </div>
          ))}
        <StatusMessage variant="error">{error}</StatusMessage>
        <ConfirmDialog
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title="Revoke application access?"
          description={`${selected?.name ?? "This application"} will need your approval to connect again.`}
          confirmText="Revoke access"
          isLoading={busy}
          onConfirm={revoke}
        />
      </CardContent>
    </Card>
  );
}
