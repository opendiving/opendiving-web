import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  usePathname: () => "/home",
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

  it("puts it first, ruled off from the rest", async () => {
    stable.auth.user = diver({ is_superuser: true });

    const menu = await openAccountMenu();

    expect(menuRows(menu).slice(0, 4)).toEqual([
      "---",
      "Admin",
      "---",
      "Import",
    ]);
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

// Every row of an open menu, with each separator as "---".
const menuRows = (menu: HTMLElement) =>
  Array.from(
    menu.querySelectorAll('[role="menuitem"], [role="separator"]'),
  ).map((row) =>
    row.getAttribute("role") === "separator" ? "---" : (row.textContent ?? ""),
  );

describe("Import and Export", () => {
  it("puts Import last in the create menu, and Import then Export above Settings", async () => {
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Create new" }));
    const createMenu = await screen.findByRole("menu");

    const createRows = menuRows(createMenu);
    expect(createRows.slice(-2)).toEqual(["---", "Import dives"]);
    expect(
      within(createMenu).getByRole("menuitem", { name: "Import dives" }),
    ).toHaveAttribute("href", expect.stringMatching(/^\/import/));

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const accountMenu = await screen.findByRole("menu");

    expect(
      within(accountMenu).getByRole("menuitem", { name: "Import" }),
    ).toHaveAttribute("href", expect.stringMatching(/^\/import/));
    expect(
      within(accountMenu).getByRole("menuitem", { name: "Export" }),
    ).toHaveAttribute("href", "/data");
  });
});

describe("the account menu's grouping", () => {
  it("holds the account and none of the record pages", async () => {
    const menu = await openAccountMenu();

    const rows = menuRows(menu);
    expect(rows.slice(0, rows.indexOf("Settings") + 1)).toEqual([
      "---",
      "Import",
      "Export",
      "Settings",
    ]);
    for (const page of [
      "Home",
      "Trips",
      "Dives",
      "Dive Sites",
      "Marine Life",
      "Gear",
      "Certifications",
      "Courses",
      "People",
      "Contacts",
      "Check-in",
    ]) {
      expect(rows).not.toContain(page);
    }
  });
});

describe("the bar", () => {
  it("lists the most used pages in order, then More", () => {
    render(<Header />);

    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Trips",
      "Dives",
      "Dive Sites",
      "Marine Life",
      "Gear",
      "Certifications",
    ]);
    // Gear and Certifications join the bar from `lg` only.
    for (const link of links.slice(0, 5))
      expect(link).not.toHaveClass("hidden");
    for (const link of links.slice(5)) expect(link).toHaveClass("hidden");
    expect(
      within(nav).getByRole("button", { name: "More" }),
    ).toBeInTheDocument();
  });

  it("marks the current page", () => {
    render(<Header />);

    // The mocked path is /home, which the bar holds, so More stays plain.
    const nav = screen.getByRole("navigation");
    const home = within(nav).getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home).toHaveClass("text-coral");
    expect(within(nav).getByRole("button", { name: "More" })).toHaveClass(
      "text-foreground",
    );
  });
});

describe("the More menu", () => {
  it("lists the record pages the bar leaves out, unruled", async () => {
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu");

    expect(menuRows(menu)).toEqual([
      "Gear",
      "Certifications",
      "Courses",
      "People",
      "Contacts",
      "Check-in",
    ]);
    // Gear and Certifications are in the bar from `lg`, so More drops them there.
    expect(within(menu).getByRole("menuitem", { name: "Gear" })).toHaveClass(
      "lg:hidden",
    );
    expect(
      within(menu).getByRole("menuitem", { name: "Courses" }),
    ).not.toHaveClass("lg:hidden");
  });
});

describe("the brand link", () => {
  it("goes to the Home page when signed in", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "OpenDiving" })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("goes to the landing page when signed out", () => {
    stable.auth.isAuthenticated = false;
    stable.auth.user = null;

    render(<Header />);

    expect(screen.getByRole("link", { name: "OpenDiving" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("the mobile menu", () => {
  it("lists every destination", async () => {
    const { container } = render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const menu = container.querySelector<HTMLElement>("#mobile-menu")!;
    expect(
      within(menu)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Home",
      "Trips",
      "Dives",
      "Dive Sites",
      "Marine Life",
      "Gear",
      "Certifications",
      "Courses",
      "People",
      "Contacts",
      "Check-in",
    ]);
    expect(within(menu).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
