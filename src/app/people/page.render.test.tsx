import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

vi.mock("@/lib/api/people", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/people")>();
  return {
    ...actual,
    peopleAPI: { ...actual.peopleAPI, getPeople: vi.fn() },
  };
});

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
    expect(getPeople).toHaveBeenCalledWith(1, 10, undefined);
  });
});
