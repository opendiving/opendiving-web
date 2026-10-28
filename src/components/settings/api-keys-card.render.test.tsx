import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeysCard } from "./api-keys-card";
import { memoryStorage, useStorage } from "@/test/memory-storage";
import { localDay } from "@/test/local-day";

// What only a render can reach: the rows a diver acts on, the create form and its
// defaults, the panel that shows a new key's secret once, and the card removing
// itself on an API without keys. The three calls are pinned in
// `lib/api/api-keys.test.ts`.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s here would not exist yet when the factories run.
const mocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/api-keys", () => ({
  apiKeysAPI: {
    getApiKeys: mocks.getApiKeys,
    createApiKey: mocks.createApiKey,
    revokeApiKey: mocks.revokeApiKey,
  },
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
// Derived rather than written down, so "expired" and "not yet" stay true whenever
// the suite runs.
const inDays = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();

const LAPTOP = {
  uuid: "key-1",
  name: "laptop",
  prefix: "odk_abcd1234",
  scope: "read",
  created_at: "2026-10-01T10:00:00Z",
  last_used_at: "2026-10-20T08:30:00Z",
  expires_at: inDays(200),
};

const NIGHTLY = {
  uuid: "key-2",
  name: "nightly sync",
  prefix: "odk_wxyz5678",
  scope: "write",
  created_at: "2026-10-02T10:00:00Z",
  last_used_at: null,
  expires_at: null,
};

const OLD = {
  uuid: "key-3",
  name: "old script",
  prefix: "odk_old00000",
  scope: "read",
  created_at: "2026-01-02T10:00:00Z",
  last_used_at: null,
  expires_at: inDays(-3),
};

const SECRET = `odk_${"S3cr3t".repeat(7)}x`;
const CREATED = {
  uuid: "key-4",
  name: "ci runner",
  prefix: SECRET.slice(0, 12),
  scope: "read",
  created_at: new Date().toISOString(),
  last_used_at: null,
  expires_at: inDays(365),
  secret: SECRET,
};

const row = (name: string) =>
  screen.getByText(name).closest("div.rounded-lg") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  useStorage(memoryStorage());
  mocks.getApiKeys.mockResolvedValue([LAPTOP, NIGHTLY]);
  mocks.createApiKey.mockResolvedValue(CREATED);
  mocks.revokeApiKey.mockResolvedValue({ message: "API key revoked" });
});

describe("ApiKeysCard", () => {
  it("lists each key with its prefix, scope, and when it was made, used and expires", async () => {
    render(<ApiKeysCard />);

    expect(await screen.findByText("laptop")).toBeInTheDocument();
    const laptop = row("laptop");
    expect(laptop).toHaveTextContent("odk_abcd1234…");
    expect(within(laptop).getByText("Read only")).toBeInTheDocument();
    expect(laptop).toHaveTextContent(`Created ${localDay(LAPTOP.created_at)}`);
    expect(laptop).toHaveTextContent(
      `Last used ${localDay(LAPTOP.last_used_at)}`,
    );
    expect(laptop).toHaveTextContent(`Expires ${localDay(LAPTOP.expires_at)}`);

    const nightly = row("nightly sync");
    expect(within(nightly).getByText("Read and write")).toBeInTheDocument();
    expect(nightly).toHaveTextContent("Never used");
    expect(nightly).toHaveTextContent("No expiry");
  });

  // An expired key stays listed until revoked - it still counts toward the cap -
  // so the row has to say why it no longer works.
  it("badges only the keys that have expired", async () => {
    mocks.getApiKeys.mockResolvedValue([LAPTOP, OLD]);
    render(<ApiKeysCard />);
    await screen.findByText("old script");

    expect(within(row("old script")).getByText("Expired")).toBeInTheDocument();
    expect(row("old script")).toHaveTextContent(
      `Expired ${localDay(OLD.expires_at)}`,
    );
    expect(within(row("laptop")).queryByText("Expired")).toBeNull();
  });

  // jsdom has no layout, so this pins the structure that keeps the revoke button
  // at the row's right edge on a phone: a row that never wraps, a text block that
  // takes the room and shrinks, and a button that does not.
  it("keeps the revoke button beside the text rather than wrapping under it", async () => {
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    const button = screen.getByRole("button", { name: "Revoke laptop" });
    const line = button.parentElement as HTMLElement;
    expect(line).toHaveClass("flex");
    expect(line).not.toHaveClass("flex-wrap");
    expect(button).toHaveClass("shrink-0");

    const text = button.previousElementSibling as HTMLElement;
    expect(text).toHaveTextContent("laptop");
    expect(text).toHaveClass("min-w-0", "flex-1");
  });

  // A year, so "never" is a choice; read-only, so writing is too.
  it("opens the form defaulting to read only and a year", async () => {
    const user = userEvent.setup();
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    await user.click(screen.getByRole("button", { name: /create api key/i }));

    expect(screen.getByLabelText("Access")).toHaveValue("read");
    expect(screen.getByLabelText("Expires after")).toHaveValue("1y");
    expect(
      within(screen.getByLabelText("Expires after"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["30 days", "90 days", "1 year", "Never"]);
  });

  it("sends nothing for an empty name", async () => {
    const user = userEvent.setup();
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    await user.click(screen.getByRole("button", { name: /create api key/i }));
    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("Give the key a name.")).toBeInTheDocument();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  // The invariant the card exists to hold: the secret is on screen once, in one
  // place, reaches the clipboard exactly, and is written nowhere else.
  it("shows a new key's secret once, copies exactly it, and stores it nowhere", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    await user.click(screen.getByRole("button", { name: /create api key/i }));
    await user.type(screen.getByLabelText("Name"), "ci runner");
    await user.selectOptions(screen.getByLabelText("Access"), "write");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() =>
      expect(mocks.createApiKey).toHaveBeenCalledWith({
        name: "ci runner",
        scope: "write",
        lifetime: "1y",
      }),
    );
    const field = await screen.findByDisplayValue(SECRET);
    expect(field).toHaveAttribute("readonly");
    expect(screen.getAllByDisplayValue(SECRET)).toHaveLength(1);
    // In the field's value and no text node anywhere.
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
    expect(within(row("ci runner")).getByLabelText("New API key")).toBe(field);
    // Appended from the response, not re-read.
    expect(mocks.getApiKeys).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ title: "API key copied" }),
    );
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain(SECRET);

    expect(window.localStorage.length).toBe(0);
    expect(window.location.href).not.toContain(SECRET);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    expect(row("ci runner")).toHaveTextContent(`${CREATED.prefix}…`);
  });

  // The cap's 409 says what to do about it, so it is shown as the API wrote it.
  it("shows the API's refusal in the form", async () => {
    const user = userEvent.setup();
    mocks.createApiKey.mockRejectedValue({
      response: {
        status: 409,
        data: {
          detail: "You already have 10 API keys. Revoke one to create another.",
        },
      },
    });
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    await user.click(screen.getByRole("button", { name: /create api key/i }));
    await user.type(screen.getByLabelText("Name"), "one more");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(
      await screen.findByText(
        "You already have 10 API keys. Revoke one to create another.",
      ),
    ).toBeInTheDocument();
  });

  it("revokes a key only after the confirmation", async () => {
    const user = userEvent.setup();
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    await user.click(screen.getByRole("button", { name: "Revoke laptop" }));
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Revoke API key");
    expect(dialog).toHaveTextContent(/stops working on its very next request/);
    mocks.getApiKeys.mockResolvedValue([NIGHTLY]);
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(mocks.revokeApiKey).toHaveBeenCalledWith("key-1"),
    );
    await waitFor(() => expect(screen.queryByText("laptop")).toBeNull());
  });

  it("says so when the list can't be loaded, and offers a retry", async () => {
    const user = userEvent.setup();
    mocks.getApiKeys.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Database is down" } },
    });
    render(<ApiKeysCard />);

    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("laptop")).toBeInTheDocument();
  });

  it("removes itself when the API has no key routes", async () => {
    mocks.getApiKeys.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<ApiKeysCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("reads the list once", async () => {
    render(<ApiKeysCard />);
    await screen.findByText("laptop");

    expect(mocks.getApiKeys).toHaveBeenCalledTimes(1);
  });
});
