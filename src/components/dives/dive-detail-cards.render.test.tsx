import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveDetailCards } from "./dive-detail-cards";
import {
  DiveDetailProvider,
  type DiveDetailValue,
} from "./dive-detail-context";
import { divesAPI, type Dive } from "@/lib/api/dives";

// The step of the pager keeps the outgoing dive on the page, dimmed, while the
// next loads - and its cards still take a click. `user` is returned by identity -
// see the note in `dives/new/page.render.test.tsx`.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1", dive_form_hidden_fields: [] as string[] },
    mergeUser: vi.fn(),
  },
  toast: { toast: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => stable.toast,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dives/dive-1",
}));

vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: { ...actual.divesAPI, updateDive: vi.fn() },
  };
});

vi.mock("@/lib/api/tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/tags")>();
  return { ...actual, fetchAllTags: vi.fn().mockResolvedValue([]) };
});

const storedDive = (uuid: string, notes: string): Dive =>
  ({
    uuid,
    user_uuid: "user-1",
    dive_number: 41,
    start_time: "2026-07-01T09:30:00+02:00",
    submerged_time: 2700,
    notes,
    tags: [],
    mixtures: [],
    gear_items: [],
    dive_sites: [],
    sightings: [],
    recordings: [],
  }) as unknown as Dive;

const detail = (dive: Dive, isLoading = false): DiveDetailValue => ({
  dive,
  isLoading,
  trip: null,
  course: null,
  contact: null,
  people: {},
  refreshDive: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a card's edit dialog across a step of the pager", () => {
  it("closes when the next dive lands, rather than saving over it", async () => {
    const outgoing = storedDive("dive-1", "First dive.");
    const { rerender } = render(
      <DiveDetailProvider value={detail(outgoing, true)}>
        <DiveDetailCards />
      </DiveDetailProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <DiveDetailProvider value={detail(storedDive("dive-2", "Second dive."))}>
        <DiveDetailCards />
      </DiveDetailProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(divesAPI.updateDive).not.toHaveBeenCalled();
  });
});
