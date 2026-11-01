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
import { LinkAddressField } from "@/components/ui/link-address-field";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";
import { McpConnectionCard } from "./mcp-connection-card";

const loadConnections = () => mcpAPI.getConnections();

export function McpSection({ serverUrl }: { serverUrl: string }) {
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

  if (list.status === "absent") {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">MCP unavailable</CardTitle>
          <CardDescription>
            MCP is not enabled on this instance. Ask the instance operator to
            enable it to connect an application.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      {list.status === "ready" && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Connect through MCP</CardTitle>
            <CardDescription>
              Connect an app or AI assistant to your OpenDiving logbook using
              the Model Context Protocol.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add this server URL in your application&apos;s MCP connection
              settings. When prompted, sign in to OpenDiving and choose the
              permissions to grant. Reading, writing, and deleting content are
              separate permissions.
            </p>
            <LinkAddressField
              url={serverUrl}
              label="MCP server URL"
              what="MCP server URL"
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Connected applications</CardTitle>
          <CardDescription>
            Apps and AI assistants connected through MCP and the permissions you
            granted them. Revoking a connection stops its access immediately.
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
              <McpConnectionCard
                key={connection.uuid}
                connection={connection}
                onRevoke={() => setSelected(connection)}
              />
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
    </>
  );
}
