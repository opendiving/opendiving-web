import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificationViewDialog } from "./certification-view-dialog";
import { peopleAPI, type Person } from "@/lib/api/people";
import type { Certification } from "@/lib/api/certifications";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/certifications",
}));
vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    getPerson: vi.fn(),
    getPersonPictureBlob: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const person = (overrides: Partial<Person>): Person => ({
  uuid: "person-1",
  name: "Sam Diver",
  notes: "",
  username: null,
  avatar_sha256: null,
  dive_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const certification: Certification = {
  uuid: "cert-1",
  agency: "padi",
  name: "Advanced Nitrox",
  instructor_uuid: "person-1",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

const open = () =>
  render(
    <CertificationViewDialog
      certification={certification}
      onOpenChange={vi.fn()}
    />,
  );

beforeEach(() => {
  vi.mocked(peopleAPI.getPerson).mockReset();
  vi.mocked(peopleAPI.getPersonPictureBlob).mockClear();
});

describe("CertificationViewDialog's instructor", () => {
  it("draws a connected instructor with their picture and @username", async () => {
    vi.mocked(peopleAPI.getPerson).mockResolvedValue(
      person({ username: "samd", avatar_sha256: "abc" }),
    );
    open();

    expect(
      await screen.findByRole("link", { name: "Sam Diver" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/people\/person-1(\?|$)/),
    );
    expect(screen.getByText("@samd")).toBeInTheDocument();
    expect(peopleAPI.getPersonPictureBlob).toHaveBeenCalledWith(
      "person-1",
      "abc",
    );
    // The label names the role, so the row does not repeat it.
    expect(screen.getAllByText("Instructor")).toHaveLength(1);
  });

  it("draws one who is not connected with the plain person mark alone", async () => {
    vi.mocked(peopleAPI.getPerson).mockResolvedValue(person({}));
    open();

    const link = await screen.findByRole("link", { name: "Sam Diver" });
    const row = link.closest("dd")!;
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(peopleAPI.getPersonPictureBlob).not.toHaveBeenCalled();
    expect(row.querySelector("svg.lucide-user")).toBeInTheDocument();
    expect(screen.getAllByText("Instructor")).toHaveLength(1);
  });

  it("draws no instructor row while their person is unresolved", () => {
    vi.mocked(peopleAPI.getPerson).mockReturnValue(new Promise(() => {}));
    open();

    expect(screen.getByText("Advanced Nitrox")).toBeInTheDocument();
    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
  });
});
