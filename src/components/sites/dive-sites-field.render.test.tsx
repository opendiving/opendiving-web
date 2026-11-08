import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiveSiteSearchItem } from "@/lib/api/dive-sites";
import type { LatLon } from "@/lib/basemap";
import type { SiteFinderProps } from "./finder/site-finder";
import { DiveSitesField } from "./dive-sites-field";

// The field against a finder that is a stand-in: what it is handed is what the
// field asks of it - where it opens, what it hides, the date it ranks by - and its
// buttons are a diver picking a row, a point on the map or adding a site.

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { lookupDiveSitesByUuid: vi.fn() },
}));
vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { lookupTripsByUuid: vi.fn() },
}));
vi.mock("@/hooks/useTags", () => ({ useTags: () => ({ tags: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const finder = vi.hoisted(() => ({
  props: null as SiteFinderProps | null,
}));
vi.mock("@/components/sites/finder/site-finder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./finder/site-finder")>();
  return {
    ...actual,
    SiteFinder: (props: SiteFinderProps) => {
      finder.props = props;
      return (
        <div>
          <button
            type="button"
            onClick={() => props.onPickSite?.(PICKED.uuid, PICKED)}
          >
            Pick Lighthouse
          </button>
          <button
            type="button"
            onClick={() => props.onPickSite?.("site-2", null)}
          >
            Pick a point
          </button>
          <button
            type="button"
            onClick={() =>
              props.onAddSite?.({ latitude: 28.5, longitude: 34.5 })
            }
          >
            Add here
          </button>
        </div>
      );
    },
  };
});

// The real form is beside the point; what matters is the pin it opens with and
// what a save hands back.
const siteForm = vi.hoisted(() => ({ pin: undefined as unknown }));
vi.mock("@/components/sites/dive-site-dialog", async () => {
  const { Dialog, DialogContent, DialogTitle } =
    await import("@/components/ui/dialog");
  return {
    DiveSiteDialog: ({
      open,
      onOpenChange,
      onSaved,
      pin,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSaved: (site: unknown, proposes: boolean) => void;
      pin?: LatLon | null;
    }) => {
      if (open) siteForm.pin = pin;
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>New Dive Site</DialogTitle>
            {[false, true].map((proposes) => (
              <button
                key={String(proposes)}
                type="button"
                onClick={() => {
                  onSaved(
                    { uuid: "site-new", name: "Canyon", location: null },
                    proposes,
                  );
                  onOpenChange(false);
                }}
              >
                {proposes ? "Save public" : "Save"}
              </button>
            ))}
          </DialogContent>
        </Dialog>
      );
    },
  };
});

vi.mock("@/components/sites/site-proposal-flow", () => ({
  SiteProposalFlow: ({
    site,
    onClose,
    onReplaced,
  }: {
    site: { name: string } | null;
    onClose: () => void;
    onReplaced: (record: unknown) => void;
  }) =>
    site && (
      <>
        <p>Proposing {site.name}</p>
        <button
          type="button"
          onClick={() => {
            onReplaced({
              uuid: "commons-1",
              name: "Blue Hole Arch",
              location: null,
            });
            onClose();
          }}
        >
          Replace
        </button>
      </>
    ),
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const { tripsAPI } = await import("@/lib/api/trips");
const lookupDiveSitesByUuid = vi.mocked(diveSitesAPI.lookupDiveSitesByUuid);
const lookupTripsByUuid = vi.mocked(tripsAPI.lookupTripsByUuid);

const OWN = { owner: "account", saved: true, attribution: null } as const;
const SITE = {
  uuid: "site-1",
  name: "Blue Hole",
  location: { name: "Dahab, Egypt" },
  latitude: 28.57,
  longitude: 34.54,
  ...OWN,
};
const SECOND_SITE = {
  uuid: "site-2",
  name: "Thistlegorm",
  location: { name: "Red Sea, Egypt" },
  latitude: 27.81,
  longitude: 33.92,
  ...OWN,
};
const UNPINNED = {
  uuid: "site-3",
  name: "Imported reef",
  location: null,
  ...OWN,
};
const PICKED: DiveSiteSearchItem = {
  kind: "site",
  uuid: "site-9",
  name: "Lighthouse",
  location: { name: "Dahab, Egypt" },
  latitude: 28.5,
  longitude: 34.52,
  distance_m: 1200,
  match: null,
  dives: null,
  proposal: null,
  ...OWN,
};
const DAHAB = { name: "Dahab, Egypt", latitude: 28.5, longitude: 34.5 };
const TRIP = {
  uuid: "trip-1",
  name: "Dahab 2026",
  parts: [
    { start_date: "2026-03-01", end_date: "2026-03-05", location: null },
    {
      start_date: "2026-03-01",
      end_date: "2026-03-08",
      location: DAHAB,
    },
  ],
};

beforeEach(() => {
  finder.props = null;
  siteForm.pin = undefined;
  lookupDiveSitesByUuid.mockReset();
  lookupDiveSitesByUuid.mockImplementation(async (uuids) =>
    [SITE, SECOND_SITE, UNPINNED].filter((site) => uuids.includes(site.uuid)),
  );
  lookupTripsByUuid.mockReset();
  lookupTripsByUuid.mockResolvedValue([TRIP] as never);
});

type FieldProps = Partial<React.ComponentProps<typeof DiveSitesField>>;

function Field({ value: initial = [], ...props }: FieldProps) {
  const [value, setValue] = useState<string[]>(initial);
  return <DiveSitesField value={value} onChange={setValue} {...props} />;
}

const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    li.textContent?.trim(),
  );

const openFinder = async (name = /dive site/) => {
  await userEvent.click(screen.getByRole("button", { name }));
  await screen.findByRole("dialog", { name: "Find a dive site" });
};

// What the finder was last told to open on, once it has been told anything.
const openedOn = async () => {
  await waitFor(() => expect(finder.props?.opening).not.toBeUndefined());
  return finder.props!.opening;
};

describe("DiveSitesField", () => {
  it("opens Find a dive site, which hides the dive's sites and ranks by its date", async () => {
    render(
      <Field
        value={[SITE.uuid]}
        knownSites={[SITE]}
        until="2026-03-04T09:00:00+02:00"
      />,
    );

    await openFinder(/Add another dive site/);

    expect(finder.props?.hiddenUuids).toEqual([SITE.uuid]);
    expect(finder.props?.until).toBe("2026-03-04T09:00:00+02:00");
    // A form's picker: a row adds, and there is no menu to delete a chip's site.
    expect(finder.props?.siteMenu).toBeUndefined();
    expect(finder.props?.siteHref).toBeUndefined();
  });

  it("adds a picked site after those on the dive, closes and hands focus back", async () => {
    render(<Field value={[SITE.uuid]} knownSites={[SITE]} />);
    await openFinder(/Add another dive site/);

    await userEvent.click(
      screen.getByRole("button", { name: "Pick Lighthouse" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    // Labelled from the row picked, with nothing read back for it.
    expect(rows()).toEqual([
      expect.stringContaining("Blue Hole"),
      expect.stringContaining("Lighthouse, Dahab, Egypt"),
    ]);
    expect(lookupDiveSitesByUuid).not.toHaveBeenCalledWith(["site-9"]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add another dive site/ }),
      ).toHaveFocus(),
    );
  });

  it("reads the name of a site picked as a point on the map", async () => {
    render(<Field />);
    await openFinder();

    await userEvent.click(screen.getByRole("button", { name: "Pick a point" }));

    await waitFor(() =>
      expect(rows()).toEqual([expect.stringContaining("Thistlegorm")]),
    );
  });

  describe("opens", () => {
    it("on the dive's one pinned site", async () => {
      render(<Field value={[SITE.uuid]} knownSites={[SITE]} />);
      await openFinder(/Add another dive site/);

      expect(await openedOn()).toEqual({
        kind: "point",
        latitude: SITE.latitude,
        longitude: SITE.longitude,
      });
    });

    it("fitted to the dive's pinned sites, past one with no pin", async () => {
      render(
        <Field
          value={[SITE.uuid, UNPINNED.uuid, SECOND_SITE.uuid]}
          diveFix={{ latitude: 1, longitude: 2 }}
        />,
      );
      await openFinder(/Add another dive site/);

      expect(await openedOn()).toEqual({
        kind: "bounds",
        south: SECOND_SITE.latitude,
        north: SITE.latitude,
        // Unwrapped against the first pin, so a hair off the pins' own values.
        west: expect.closeTo(SECOND_SITE.longitude, 9),
        east: expect.closeTo(SITE.longitude, 9),
      });
    });

    it("on the dive's fix where none of its sites has a pin", async () => {
      render(
        <Field
          value={[UNPINNED.uuid]}
          diveFix={{ latitude: 28.41, longitude: 34.47 }}
          tripUuid={TRIP.uuid}
          until="2026-03-04T09:00:00"
        />,
      );
      await openFinder(/Add another dive site/);

      expect(await openedOn()).toEqual({
        kind: "point",
        latitude: 28.41,
        longitude: 34.47,
      });
      expect(lookupTripsByUuid).not.toHaveBeenCalled();
    });

    it("on the first part of its trip with a place whose dates hold the dive's day", async () => {
      render(<Field tripUuid={TRIP.uuid} until="2026-03-04T23:30:00-05:00" />);
      await openFinder();

      expect(await openedOn()).toEqual({
        kind: "point",
        latitude: DAHAB.latitude,
        longitude: DAHAB.longitude,
      });
      expect(lookupTripsByUuid).toHaveBeenCalledWith([TRIP.uuid]);
    });

    it("on the world where the trip's parts hold another day", async () => {
      render(<Field tripUuid={TRIP.uuid} until="2026-04-01T09:00:00" />);
      await openFinder();

      expect(await openedOn()).toBeNull();
    });

    it("on the world with nothing to open on, reading no trip", async () => {
      render(<Field until="2026-03-04T09:00:00" />);
      await openFinder();

      expect(await openedOn()).toBeNull();
      expect(lookupTripsByUuid).not.toHaveBeenCalled();
    });

    it("on the world where the trip cannot be read", async () => {
      lookupTripsByUuid.mockRejectedValue(new Error("500"));
      render(<Field tripUuid={TRIP.uuid} until="2026-03-04T09:00:00" />);
      await openFinder();

      expect(await openedOn()).toBeNull();
    });

    it("once a chosen site's row has come back, rather than jumping", async () => {
      let answer!: (rows: (typeof SITE)[]) => void;
      lookupDiveSitesByUuid.mockReturnValue(
        new Promise((resolve) => (answer = resolve)) as never,
      );
      render(<Field value={[SITE.uuid]} />);
      await openFinder(/Add another dive site/);

      expect(finder.props?.opening).toBeUndefined();
      answer([SITE]);

      expect(await openedOn()).toMatchObject({ kind: "point" });
    });

    it("reads no trip until it is opened", async () => {
      render(<Field tripUuid={TRIP.uuid} until="2026-03-04T09:00:00" />);

      expect(lookupTripsByUuid).not.toHaveBeenCalled();
    });
  });

  describe("a new site", () => {
    const addSite = async (save: string) => {
      await openFinder();
      await userEvent.click(screen.getByRole("button", { name: save }));
      await userEvent.click(
        await screen.findByRole("button", { name: "Save public" }),
      );
    };

    it("opens the form at the map's pin, and lands on the dive", async () => {
      render(<Field />);
      await openFinder();
      await userEvent.click(screen.getByRole("button", { name: "Add here" }));
      expect(siteForm.pin).toEqual({ latitude: 28.5, longitude: 34.5 });
      await userEvent.click(
        await screen.findByRole("button", { name: "Save" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(rows()).toEqual(["Canyon"]);
    });

    it("opens the form with no pin from Add dive site", async () => {
      render(<Field />);
      await openFinder();
      await userEvent.click(
        screen.getByRole("button", { name: "Add dive site..." }),
      );

      await screen.findByRole("dialog", { name: "New Dive Site" });
      expect(siteForm.pin).toBeNull();
    });

    it("saved with Public chosen, is on the dive and opens the flow", async () => {
      render(<Field />);
      await addSite("Add dive site...");

      expect(await screen.findByText("Proposing Canyon")).toBeInTheDocument();
      expect(rows()).toEqual([expect.stringContaining("Canyon")]);
    });

    it("swaps for the record a replace leaves", async () => {
      render(<Field />);
      await addSite("Add dive site...");

      await userEvent.click(
        await screen.findByRole("button", { name: "Replace" }),
      );

      await waitFor(() =>
        expect(rows()).toEqual([expect.stringContaining("Blue Hole Arch")]),
      );
    });
  });

  it("names both per-row controls after the site they act on", async () => {
    // Two rows is the smallest list that can prove it: with one, "Remove" and
    // "Remove Blue Hole" are equally unambiguous.
    render(
      <DiveSitesField
        value={[SITE.uuid, SECOND_SITE.uuid]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Blue Hole" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Thistlegorm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Reorder Blue Hole, position 1 of 2 \(primary site\)\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Reorder Thistlegorm, position 2 of 2\./,
      }),
    ).toBeInTheDocument();
  });

  it("warns under a site whose water or altitude differs from the first that records one", async () => {
    const records = {
      [SITE.uuid]: { ...SITE, water_type: "salt", altitude: 0 },
      [SECOND_SITE.uuid]: { ...SECOND_SITE, water_type: "fresh", altitude: 0 },
      "site-3": { uuid: "site-3", name: "Tarn", altitude: 2400 },
    };
    lookupDiveSitesByUuid.mockImplementation(
      async (uuids) => uuids.map((uuid) => records[uuid]) as never,
    );
    render(
      <DiveSitesField
        value={[SITE.uuid, SECOND_SITE.uuid, "site-3"]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(rows()).toEqual([
        "Blue Hole, Dahab, Egypt",
        "Thistlegorm, Red Sea, EgyptFresh water, unlike Blue Hole (salt water)",
        "TarnAltitude 2400 m, unlike Blue Hole (0 m)",
      ]),
    );
  });

  it("removes the site whose button was pressed", async () => {
    const onChange = vi.fn();
    render(
      <DiveSitesField
        value={[SITE.uuid, SECOND_SITE.uuid]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Thistlegorm" }),
    );

    expect(onChange).toHaveBeenCalledWith([SITE.uuid]);
  });
});
