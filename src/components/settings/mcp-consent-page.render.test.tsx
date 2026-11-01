import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { McpConsent } from "@/lib/api/mcp";
import { McpConsentPage } from "./mcp-consent-page";

const api = vi.hoisted(() => ({
  getConsent: vi.fn(),
  decideConsent: vi.fn(),
  request: "opaque-request",
  user: { uuid: "account-A", email: "diver@example.com" },
}));

function pendingConsent() {
  const resolve = vi.fn<(consent: McpConsent) => void>();
  const promise = new Promise<McpConsent>((complete) => {
    resolve.mockImplementation(complete);
  });
  return { promise, resolve };
}
vi.mock("@/lib/api/mcp", () => ({ mcpAPI: api }));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: api.user,
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ request: api.request }),
}));

beforeEach(() => {
  api.request = "opaque-request";
  api.user = { uuid: "account-A", email: "diver@example.com" };
  api.getConsent.mockResolvedValue({
    name: "Dive assistant",
    client_id: "client-123",
    redirect_uri: "https://client.example/callback",
    scopes: ["dives:read", "dives:write", "dives:delete"],
  });
  api.decideConsent.mockRejectedValue(new Error("Connection unavailable"));
});

it("hides the old application and selections immediately when the request changes", async () => {
  const { rerender } = render(<McpConsentPage />);
  await screen.findByText("Connect Dive assistant");
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  const pending = pendingConsent();
  api.getConsent.mockReturnValueOnce(pending.promise);
  api.request = "request-B";
  rerender(<McpConsentPage />);
  expect(screen.queryByText("Connect Dive assistant")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Allow selected permissions" }),
  ).not.toBeInTheDocument();
  await act(async () =>
    pending.resolve({
      name: "Second application",
      client_id: "client-B",
      redirect_uri: "https://second.example/callback",
      scopes: ["dives:read", "dives:write"],
    }),
  );
  expect(
    await screen.findByText("Connect Second application"),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
  fireEvent.click(
    screen.getByRole("button", { name: "Allow selected permissions" }),
  );
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("request-B", ["dives:read"]),
  );
});

it("reloads consent and clears selections when the signed-in account changes", async () => {
  const { rerender } = render(<McpConsentPage />);
  await screen.findByText("Connect Dive assistant");
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  api.getConsent.mockImplementationOnce(() => new Promise(() => {}));
  api.user = { uuid: "account-B", email: "second@example.com" };
  rerender(<McpConsentPage />);
  expect(screen.queryByText("Connect Dive assistant")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Allow selected permissions" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(api.getConsent).toHaveBeenCalledTimes(2));
});

it("ignores a consent response that arrives after navigation to a new request", async () => {
  const pending = pendingConsent();
  api.getConsent.mockReturnValueOnce(pending.promise);
  const { rerender } = render(<McpConsentPage />);
  api.request = "request-B";
  rerender(<McpConsentPage />);
  await screen.findByText("Connect Dive assistant");
  await act(async () =>
    pending.resolve({
      name: "Old application",
      client_id: "old-client",
      redirect_uri: "https://old.example/callback",
      scopes: ["dives:delete"],
    }),
  );
  expect(screen.queryByText("Connect Old application")).not.toBeInTheDocument();
  expect(screen.getByText("Connect Dive assistant")).toBeInTheDocument();
});

it("starts with reads selected and requires a choice for writing or deleting", async () => {
  render(<McpConsentPage />);
  expect(await screen.findByText("Connect Dive assistant")).toBeInTheDocument();
  const checkboxes = screen.getAllByRole("checkbox");
  expect(checkboxes[0]).toBeChecked();
  expect(checkboxes[1]).not.toBeChecked();
  expect(checkboxes[2]).not.toBeChecked();
  fireEvent.click(
    screen.getByRole("button", { name: "Allow selected permissions" }),
  );
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", [
      "dives:read",
    ]),
  );
});

it("submits only the permissions the user selected", async () => {
  render(<McpConsentPage />);
  await screen.findByText("Connect Dive assistant");
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.click(
    screen.getByRole("button", { name: "Allow selected permissions" }),
  );
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", [
      "dives:read",
      "dives:write",
    ]),
  );
});

it("denies without granting any requested permissions", async () => {
  render(<McpConsentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Deny" }));
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", []),
  );
});

it("selects all requested permissions and allows them together", async () => {
  render(<McpConsentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
  expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox")) {
    expect(checkbox).toBeChecked();
  }
  expect(api.decideConsent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Allow all" }));
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", [
      "dives:read",
      "dives:write",
      "dives:delete",
    ]),
  );
});

it("restores read-only access after selecting all permissions", async () => {
  render(<McpConsentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
  fireEvent.click(screen.getByRole("button", { name: "Read only" }));
  expect(screen.getByRole("checkbox", { name: "Read dives" })).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "Create & edit dives" }),
  ).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "Delete dives" }),
  ).not.toBeChecked();
  fireEvent.click(
    screen.getByRole("button", { name: "Allow selected permissions" }),
  );
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", [
      "dives:read",
    ]),
  );
});

it("can allow every requested permission without selecting each one first", async () => {
  render(<McpConsentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Allow all" }));
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", [
      "dives:read",
      "dives:write",
      "dives:delete",
    ]),
  );
});

it("groups permissions by content and keeps every requested scope available", async () => {
  const scopes = [
    "dives:delete",
    "dives:read",
    "dives:write",
    "checkin:share",
    "import:write",
    "files:read",
    "custom-resource:custom-action",
  ];
  api.getConsent.mockResolvedValue({
    name: "Dive assistant",
    client_id: "client-123",
    redirect_uri: "https://client.example/callback",
    scopes,
  });
  render(<McpConsentPage />);
  const dives = await screen.findByRole("group", { name: "Dives" });
  expect(within(dives).getAllByRole("checkbox")).toHaveLength(3);
  expect(screen.getAllByRole("checkbox")).toHaveLength(scopes.length);
  expect(
    screen.getByRole("checkbox", { name: "Share check-in" }),
  ).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "custom action custom resource" }),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow all" }));
  await waitFor(() =>
    expect(api.decideConsent).toHaveBeenCalledWith("opaque-request", scopes),
  );
});

it("disables approval when no permissions are selected", async () => {
  render(<McpConsentPage />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Read dives" }));
  expect(
    screen.getByRole("button", { name: "Allow selected permissions" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
});
