import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PeoplePage from "./page";
import { peopleAPI, type Person } from "@/lib/api/people";

// Returned by identity, for the reason `certifications/page.render.test.tsx` gives:
// this page's fetch callback is keyed on the session, and a fresh `user` per render
// re-runs the fetch on every render it causes.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  },
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
}));

// Lives in `AppShell`, above the page rendered here.
vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));

vi.mock("@/lib/api/people", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/people")>();
  return {
    ...actual,
    peopleAPI: {
      ...actual.peopleAPI,
      getPeople: vi.fn(),
      getAddedYou: vi.fn(),
      getPersonPictureBlob: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/connect-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/connect-links")>()),
  connectLinksAPI: { getOwn: vi.fn() },
}));

const person = (overrides: Partial<Person> = {}): Person => ({
  uuid: "person-1",
  name: "Alex M.",
  email: "alex@example.com",
  phone: null,
  notes: "",
  username: "alexm",
  dive_count: 3,
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const getPeople = vi.mocked(peopleAPI.getPeople);
const getAddedYou = vi.mocked(peopleAPI.getAddedYou);
const { connectLinksAPI } = await import("@/lib/api/connect-links");
const getOwn = vi.mocked(connectLinksAPI.getOwn);

beforeEach(() => {
  vi.clearAllMocks();
  getPeople.mockResolvedValue({
    data: [
      person(),
      person({
        uuid: "person-2",
        name: "Sam",
        email: null,
        username: null,
        dive_count: 1,
      }),
    ],
    total_count: 2,
    has_more: false,
    page: 1,
    items_per_page: 10,
  });
  getAddedYou.mockResolvedValue({
    data: [],
    total_count: 0,
    has_more: false,
    page: 1,
    items_per_page: 50,
  });
  getOwn.mockResolvedValue({
    token: "0123456789abcdef0123456789abcdef",
    created_at: "2026-11-23T09:00:00Z",
  });
  window.history.replaceState(null, "", "/people");
});

describe("the People page", () => {
  it("lists each person's name, username, email, phone and dive count", async () => {
    render(<PeoplePage />);

    const row = (await screen.findByRole("link", { name: "Alex M." })).closest(
      "tr",
    )!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Alex M.", "@alexm", "alex@example.com", "-", "3", ""]);
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Name", "Username", "Email", "Phone", "Dives", "Actions"]);
  });

  it("links the dive count to the person's page, where the dives are", async () => {
    render(<PeoplePage />);

    expect(
      await screen.findByRole("link", { name: "3 dives with Alex M." }),
    ).toHaveAttribute("href", "/people/person-1");
    expect(
      screen.getByRole("link", { name: "1 dive with Sam" }),
    ).toHaveAttribute("href", "/people/person-2");
  });

  it("names each row's controls after the person", async () => {
    render(<PeoplePage />);
    await screen.findByRole("link", { name: "Sam" });

    expect(
      screen.getByRole("button", { name: "Edit Alex M." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Sam" }),
    ).toBeInTheDocument();
  });

  it("counts people, never persons", async () => {
    render(<PeoplePage />);

    expect(await screen.findByText("2 total people")).toBeInTheDocument();
  });

  it("searches the name and the username with one term", async () => {
    render(<PeoplePage />);
    await screen.findByRole("link", { name: "Sam" });

    expect(
      screen.getByRole("searchbox", {
        name: "Search people by name or username",
      }),
    ).toBeInTheDocument();
    expect(getPeople).toHaveBeenCalledWith(1, 10, { search: "" });
  });

  it("opens the connect link pane from its header", async () => {
    const user = userEvent.setup();
    render(<PeoplePage />);
    await screen.findByRole("link", { name: "Sam" });

    await user.click(screen.getByRole("button", { name: "Connect link" }));

    expect(
      await screen.findByRole("dialog", { name: "Your connect link" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue(/\/connect\/0123456789abcdef/),
    ).toBeInTheDocument();
  });

  // Where the connect page sends the owner of the link it was opened with.
  it("opens the pane on arrival at its address", async () => {
    window.history.replaceState(null, "", "/people?show=connect-link");

    render(<PeoplePage />);

    expect(
      await screen.findByRole("dialog", { name: "Your connect link" }),
    ).toBeInTheDocument();
  });

  it("shows Added you above the list only when somebody is in it", async () => {
    getAddedYou.mockResolvedValue({
      data: [{ uuid: "account-1", name: "Robin Reef", username: "robin" }],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 50,
    });

    render(<PeoplePage />);

    const heading = await screen.findByRole("heading", { name: "Added you" });
    const list = screen.getByRole("table");
    expect(
      heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("has no Added you where nobody added the diver", async () => {
    render(<PeoplePage />);
    await screen.findByRole("link", { name: "Sam" });

    expect(screen.queryByRole("heading", { name: "Added you" })).toBeNull();
  });
});
