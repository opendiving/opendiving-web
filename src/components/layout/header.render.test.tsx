import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./header";
import type { User } from "@/lib/api/auth";

// Returned by identity rather than rebuilt per call - the real `AuthContext`
// holds this in state, and a fresh object per render is the shape that has
// looped page tests here before. See "A shared mock response object hides a
// render loop" in DECISIONS.md.
const stable = vi.hoisted(() => ({
  auth: {
    user: null as User | null,
    isAuthenticated: true,
    isLoading: false,
    signOut: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// The header only asks this context for the "+" menu's opener, and nothing in
// these tests presses it.
vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));

// The bell's own reads are `notifications-menu.render.test.tsx`'s subject; here it
// only has to be in its place.
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoaded: true,
    serviceDue: { rows: [], truncated: false, failed: false },
    renewals: { rows: [], truncated: false, failed: false },
    policiesFailed: false,
    count: 0,
    reload: vi.fn(),
  }),
}));

const diver = (overrides: Partial<User> = {}): User => ({
  uuid: "user-1",
  name: "Sam Reef",
  username: "samreef",
  email: "sam@example.com",
  units: "metric",
  dive_form_hidden_fields: [],
  ...overrides,
});

// Opens the account dropdown and returns its menu.
const openAccountMenu = async () => {
  render(<Header />);
  await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
  return screen.findByRole("menu");
};

beforeEach(() => {
  stable.auth.isAuthenticated = true;
  stable.auth.user = diver();
});

describe("the notifications bell", () => {
  it("sits directly left of the account avatar", () => {
    render(<Header />);

    const names = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names.indexOf("Account menu")).toBe(
      names.indexOf("Notifications") + 1,
    );
  });

  it("is not offered to a signed-out visitor", () => {
    stable.auth.isAuthenticated = false;
    stable.auth.user = null;

    render(<Header />);

    expect(
      screen.queryByRole("button", { name: /^Notifications/ }),
    ).not.toBeInTheDocument();
  });
});

describe("the account menu's Admin entry", () => {
  it("offers Admin to a superuser", async () => {
    stable.auth.user = diver({ is_superuser: true });

    await openAccountMenu();

    expect(screen.getByRole("menuitem", { name: /Admin/ })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("puts it directly beneath Settings", async () => {
    // The entry is the only way into the section, and the account menu is where
    // an operator goes looking - one row below the other account destination.
    stable.auth.user = diver({ is_superuser: true });

    const menu = await openAccountMenu();

    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      (item) => item.textContent,
    );
    expect(labels.indexOf("Admin")).toBe(labels.indexOf("Settings") + 1);
  });

  it("does not offer it to an ordinary diver", async () => {
    stable.auth.user = diver({ is_superuser: false });

    await openAccountMenu();

    expect(
      screen.queryByRole("menuitem", { name: /Admin/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer it when the API never sent the field", async () => {
    // An instance one version behind omits `is_superuser` entirely, and an
    // absent field must not read as a yes - this is the entry that opens a door.
    stable.auth.user = diver();

    await openAccountMenu();

    expect(
      screen.queryByRole("menuitem", { name: /Admin/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Settings/ }),
    ).toBeInTheDocument();
  });
});

describe("the account menu's Settings entry", () => {
  it("links to the first section rather than through the redirect", async () => {
    await openAccountMenu();

    expect(screen.getByRole("menuitem", { name: /Settings/ })).toHaveAttribute(
      "href",
      "/settings/account",
    );
  });
});

describe("the account menu's Import and Export entries", () => {
  it("links Import to its page and Export to the page that kept the old URL", async () => {
    await openAccountMenu();

    expect(screen.getByRole("menuitem", { name: "Import" })).toHaveAttribute(
      "href",
      "/import",
    );
    expect(screen.getByRole("menuitem", { name: "Export" })).toHaveAttribute(
      "href",
      "/data",
    );
  });
});

describe("the account menu's grouping", () => {
  it("rules off the records from the account itself", async () => {
    // Marine Life is the last of the records a diver keeps; Import is the first row
    // that is about the account, and Export follows it. Exactly one rule between
    // the records and them.
    const menu = await openAccountMenu();

    const rows = Array.from(
      menu.querySelectorAll('[role="menuitem"], [role="separator"]'),
    ).map((row) =>
      row.getAttribute("role") === "separator"
        ? "---"
        : (row.textContent ?? ""),
    );

    const marineLifeToSettings = rows.slice(
      rows.indexOf("Marine Life"),
      rows.indexOf("Settings") + 1,
    );
    expect(marineLifeToSettings).toEqual([
      "Marine Life",
      "---",
      "Import",
      "Export",
      "Settings",
    ]);
  });
});
