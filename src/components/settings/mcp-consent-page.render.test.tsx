import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { McpConsentPage } from "./mcp-consent-page";

const api = vi.hoisted(() => ({ getConsent: vi.fn(), decideConsent: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpAPI: api }));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { email: "diver@example.com" },
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("request=opaque-request"),
}));

beforeEach(() => {
  api.getConsent.mockResolvedValue({
    name: "Dive assistant",
    client_id: "client-123",
    redirect_uri: "https://client.example/callback",
    scopes: ["dives:read", "dives:write", "dives:delete"],
  });
  api.decideConsent.mockRejectedValue(new Error("Connection unavailable"));
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
