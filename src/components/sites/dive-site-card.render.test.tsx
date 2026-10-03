import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteCard } from "./dive-site-card";
import type { DiveSite } from "@/lib/api/dive-sites";
import { reveal } from "@/test/intersection";

// A card shows the server's picture of a site's pin and water without one, says
// where the site is, how high and how divers get in where it records them, and
// lays out what the diver's dives there add up to.

const account = vi.hoisted(() => ({
  user: { uuid: "user-1", units: "metric" as "metric" | "imperial" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => account,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// The picture's bytes; what matters here is which cards ask for one, of what.
const { getMapPicture } = vi.hoisted(() => ({ getMapPicture: vi.fn() }));
vi.mock("@/lib/api/map-pictures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-pictures")>()),
  mapPicturesAPI: { getMapPicture },
}));

// jsdom implements neither.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:picture");
  URL.revokeObjectURL = vi.fn();
  getMapPicture.mockReset();
  getMapPicture.mockResolvedValue(new Blob(["webp"]));
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

function site(overrides: Partial<DiveSite> = {}): DiveSite {
  return {
    uuid: "site-1",
    name: "The Canyon",
    user_uuid: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    dive_count: 7,
    max_dive_depth: 31.4,
    species_count: 12,
    ...overrides,
  };
}

const card = (props: Partial<Parameters<typeof DiveSiteCard>[0]> = {}) => {
  render(
    <ul>
      <DiveSiteCard
        site={site()}
        onEdit={() => {}}
        onDelete={() => {}}
        isDeleting={false}
        {...props}
      />
    </ul>,
  );
  act(() => reveal());
  return screen.getByRole("listitem");
};

// The line under the name.
const subtitleOf = (item: HTMLElement) =>
  within(item).getByRole("link", { name: "The Canyon" }).nextElementSibling!;

const figuresOf = (item: HTMLElement) =>
  Array.from(item.querySelectorAll("dt"), (term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);

describe("DiveSiteCard", () => {
  it("shows the server's picture of a site's pin, named by the site", async () => {
    const item = card({
      site: site({
        latitude: 28.5721,
        longitude: 34.5372,
        map_picture: "digest-canyon",
      }),
    });

    const map = await within(item).findByRole("img", {
      name: "Map of The Canyon",
    });
    expect(map.querySelector("img")).toHaveAttribute("src", "blob:picture");
    expect(getMapPicture).toHaveBeenCalledExactlyOnceWith(
      "/dive-site/site-1/map-picture?theme=light&v=digest-canyon",
      expect.any(AbortSignal),
    );
  });

  // The locality's centre is the town, not the site.
  it("draws water and a pin for a site with only a locality", () => {
    const item = card({
      site: site({
        location: {
          name: "Dahab, South Sinai, Egypt",
          latitude: 28.5,
          longitude: 34.51,
        },
      }),
    });

    expect(within(item).queryByRole("img")).not.toBeInTheDocument();
    expect(
      item.querySelector(".bg-\\[var\\(--map-water\\)\\] svg.lucide-dive-site"),
    ).toBeInTheDocument();
    expect(getMapPicture).not.toHaveBeenCalled();
  });

  it("names the site and links to its page", () => {
    const item = card();

    expect(
      within(item).getByRole("link", { name: "The Canyon" }),
    ).toHaveAttribute("href", "/sites/site-1");
  });

  it("says where it is, how high and how divers get in", () => {
    const item = card({
      site: site({
        location: { name: "Dahab, South Sinai, Egypt" },
        altitude: 0,
        entry_types: ["shore", "boat", "hovercraft"],
      }),
    });

    const line = subtitleOf(item);
    // Each marked by an icon on screen and by a word to a screen reader.
    expect(line).toHaveTextContent(
      "Dahab, South Sinai, Egypt · Altitude 0 m · Entry types Shore, Boat, hovercraft",
    );
    expect(line.querySelector("svg.lucide-mountain")).toHaveAttribute(
      "aria-hidden",
    );
    expect(line.querySelector("svg.lucide-waves-arrow-down")).toHaveAttribute(
      "aria-hidden",
    );
  });

  it("leaves out what it does not record", () => {
    const item = card({ site: site({ altitude: 2300, entry_types: [] }) });

    expect(subtitleOf(item)).toHaveTextContent(/^Altitude 2300 m$/);
  });

  it("names one way in in the singular", () => {
    const item = card({ site: site({ entry_types: ["pier"] }) });

    expect(subtitleOf(item)).toHaveTextContent(/^Entry type Pier$/);
  });

  it("draws no line under the name for a site recording none of them", () => {
    const item = card();

    expect(item.querySelector(".text-xs:not(dt)")).not.toBeInTheDocument();
  });

  it("titles its figures", () => {
    expect(figuresOf(card())).toEqual([
      ["Dives", "7"],
      ["Deepest", "31 m"],
      ["Species seen", "12"],
    ]);
  });

  it("counts zero dives, and leaves out the species until there are some", () => {
    const item = card({
      site: site({ dive_count: 0, max_dive_depth: null, species_count: 0 }),
    });

    expect(figuresOf(item)).toEqual([
      ["Dives", "0"],
      ["Deepest", "-"],
    ]);
  });

  it("edits and deletes from its menu", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const item = card({ onEdit, onDelete });

    const openMenu = () =>
      userEvent.click(
        within(item).getByRole("button", { name: "Actions for The Canyon" }),
      );
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit" }),
    );
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
