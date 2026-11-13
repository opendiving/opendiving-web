import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { McpConnection } from "@/lib/api/mcp";
import { McpConnectionCard } from "./mcp-connection-card";

const connection: McpConnection = {
  uuid: "019a4164-3360-7000-8000-000000000001",
  client_id: "application-id",
  name: "Dive assistant",
  scopes: ["dives:read", "dives:write", "sites:read"],
  created_at: "2026-10-31T10:00:00Z",
  last_used_at: "2026-11-01T09:30:00Z",
};

it("shows connection activity and makes the granted permissions readable by content", () => {
  const onRevoke = vi.fn();
  const { container } = render(
    <McpConnectionCard connection={connection} onRevoke={onRevoke} />,
  );
  expect(screen.getByText("Last used")).toBeInTheDocument();
  expect(
    container.querySelector(`time[datetime="${connection.last_used_at}"]`),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("Permissions", { selector: "summary" }));
  const table = screen.getByRole("table", {
    name: "Permissions granted to Dive assistant",
  });
  expect(
    within(table).getByRole("columnheader", { name: "Create & edit" }),
  ).toBeInTheDocument();
  expect(
    within(within(table).getByRole("row", { name: /Dives/ })).getAllByText(
      "Allowed",
    ),
  ).toHaveLength(2);
  expect(
    within(within(table).getByRole("row", { name: /Dive sites/ })).getByText(
      "Not granted",
    ),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Revoke access for Dive assistant" }),
  );
  expect(onRevoke).toHaveBeenCalledOnce();
});

it("does not invent a last-used date when no activity is recorded", () => {
  render(
    <McpConnectionCard
      connection={{ ...connection, last_used_at: null }}
      onRevoke={vi.fn()}
    />,
  );
  expect(screen.getByText("No activity recorded")).toBeInTheDocument();
});
