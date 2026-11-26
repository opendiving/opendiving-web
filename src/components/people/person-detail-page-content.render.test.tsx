import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonDetailPageContent } from "./person-detail-page-content";
import type { Person } from "@/lib/api/people";

const stable = vi.hoisted(() => ({
  guard: { user: { uuid: "user-1" }, isAuthenticated: true, isLoading: false },
  person: null as Person | null,
  setPerson: vi.fn(),
  disconnectPerson: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/people/person-1",
}));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));
vi.mock("@/hooks/useResource", () => ({
  useResource: () => ({
    resource: stable.person,
    setResource: stable.setPerson,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    getPerson: vi.fn(),
    deletePerson: vi.fn(),
    disconnectPerson: stable.disconnectPerson,
    getPersonPictureBlob: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
// Each covered where it lives, and each would make requests of its own here.
vi.mock("@/components/dives/recent-dives-card", () => ({
  RecentDivesCard: () => null,
}));
vi.mock("@/components/people/person-dialog", () => ({
  PersonDialog: () => null,
}));

const CONNECTED: Person = {
  uuid: "person-1",
  name: "Sam Diver",
  notes: "",
  username: "samd",
  avatar_sha256: "abc",
  dive_count: 2,
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  stable.disconnectPerson.mockResolvedValue({
    ...CONNECTED,
    username: null,
    avatar_sha256: null,
  });
});

describe("PersonDetailPageContent", () => {
  it("disconnects a connected person after a confirmation that keeps them", async () => {
    stable.person = CONNECTED;
    const user = userEvent.setup();
    render(<PersonDetailPageContent />);

    expect(screen.getByText("@samd")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Disconnect" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Disconnect" });
    expect(dialog).toHaveTextContent(/Sam Diver stays in your people/);
    expect(stable.disconnectPerson).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() =>
      expect(stable.disconnectPerson).toHaveBeenCalledWith("person-1"),
    );
    expect(stable.setPerson).toHaveBeenCalledWith(
      expect.objectContaining({ username: null, avatar_sha256: null }),
    );
  });

  it("offers no Disconnect for a person who is not connected", async () => {
    stable.person = { ...CONNECTED, username: null, avatar_sha256: null };
    const user = userEvent.setup();
    render(<PersonDetailPageContent />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));

    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Disconnect" })).toBeNull();
  });

  it("lists the person's links in a card of their own", () => {
    stable.person = {
      ...CONNECTED,
      links: [
        { url: "https://padi.example/elearning", label: "Course materials" },
        { url: "https://blueocean.example/", label: null },
      ],
    };
    render(<PersonDetailPageContent />);

    expect(screen.getByRole("heading", { name: "Links" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Course materials" }),
    ).toHaveAttribute("href", "https://padi.example/elearning");
    const bare = screen.getByRole("link", { name: "blueocean.example" });
    expect(bare).toHaveAttribute("href", "https://blueocean.example/");
    expect(bare).toHaveAttribute("target", "_blank");
  });
});
