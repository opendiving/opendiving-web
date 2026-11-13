import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
