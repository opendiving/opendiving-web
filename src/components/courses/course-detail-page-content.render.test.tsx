import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourseDetailPageContent } from "./course-detail-page-content";
import { peopleAPI, type Person } from "@/lib/api/people";
import type { Course } from "@/lib/api/courses";

const stable = vi.hoisted(() => ({
  guard: { user: { uuid: "user-1" }, isAuthenticated: true, isLoading: false },
  course: null as Course | null,
  people: {} as Record<string, Person>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/courses/course-1",
}));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));
vi.mock("@/hooks/useResource", () => ({
  useResource: () => ({
    resource: stable.course,
    setResource: vi.fn(),
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRecordByUuid", () => ({
  useRecordByUuid: () => undefined,
}));
vi.mock("@/hooks/usePeopleByUuid", () => ({
  usePeopleByUuid: () => stable.people,
}));
vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
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
vi.mock("@/components/courses/course-certifications-card", () => ({
  CourseCertificationsCard: () => null,
}));
vi.mock("@/components/courses/course-dialog", () => ({
  CourseDialog: () => null,
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

const course = (instructor: Person): Course => ({
  uuid: "course-1",
  name: "Open Water",
  status: "completed",
  people: [{ person_uuid: instructor.uuid, role: "instructor" }],
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.mocked(peopleAPI.getPersonPictureBlob).mockClear();
});

describe("CourseDetailPageContent's instructor", () => {
  it("draws a connected instructor with their picture and @username", () => {
    const instructor = person({ username: "samd", avatar_sha256: "abc" });
    stable.people = { [instructor.uuid]: instructor };
    stable.course = course(instructor);
    render(<CourseDetailPageContent />);

    expect(screen.getByRole("link", { name: "Sam Diver" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/people\/person-1(\?|$)/),
    );
    expect(screen.getByText("@samd")).toBeInTheDocument();
    expect(peopleAPI.getPersonPictureBlob).toHaveBeenCalledWith(
      "person-1",
      "abc",
    );
    // The block's label names the role, so the row does not repeat it.
    expect(screen.getAllByText("Instructor")).toHaveLength(1);
  });

  it("draws one who is not connected with the plain person mark alone", () => {
    const instructor = person({});
    stable.people = { [instructor.uuid]: instructor };
    stable.course = course(instructor);
    const { container } = render(<CourseDetailPageContent />);

    expect(screen.getByRole("link", { name: "Sam Diver" })).toBeInTheDocument();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(peopleAPI.getPersonPictureBlob).not.toHaveBeenCalled();
    expect(container.querySelector("svg.lucide-user")).toBeInTheDocument();
    expect(screen.getAllByText("Instructor")).toHaveLength(1);
  });

  it("draws no instructor block while their person is unresolved", () => {
    const instructor = person({});
    stable.people = {};
    stable.course = course(instructor);
    render(<CourseDetailPageContent />);

    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
  });
});

describe("CourseDetailPageContent's links", () => {
  it("lists every link, each opening in a new tab", () => {
    const instructor = person({});
    stable.people = {};
    stable.course = {
      ...course(instructor),
      links: [
        { url: "https://padi.example/elearning", label: "Course materials" },
        { url: "https://blueocean.example/", label: null },
      ],
    };
    render(<CourseDetailPageContent />);

    expect(
      screen.getByRole("link", { name: "Course materials" }),
    ).toHaveAttribute("href", "https://padi.example/elearning");
    const bare = screen.getByRole("link", { name: "blueocean.example" });
    expect(bare).toHaveAttribute("href", "https://blueocean.example/");
    expect(bare).toHaveAttribute("target", "_blank");
  });
});
