import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteDialog } from "./dive-site-dialog";

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: {
    createDiveSite: vi.fn(),
    updateDiveSite: vi.fn(),
    getDiveSite: vi.fn(),
  },
}));

// The tags picker reads the diver's vocabulary on mount.
vi.mock("@/lib/api/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/tags")>()),
  fetchAllTags: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: {
    reverseGeocode: vi.fn(),
    searchPlaces: vi.fn().mockResolvedValue([]),
  },
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

// Only the call is stubbed; `diveSitePlaceContext` is the rule this dialog
// writes the Location field by, and a stand-in for it here would be testing the
// stand-in.
vi.mock("@/lib/api/dive-site-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-site-catalog")>()),
  diveSiteCatalogAPI: { suggestDiveSites: vi.fn() },
}));

// The search puts a distance on its rows, and the depths and the altitude are
// typed, in the units read off the diver's account.
const account = vi.hoisted(() => ({
  user: { uuid: "user-1", units: "metric" as "metric" | "imperial" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => account,
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const createDiveSite = vi.mocked(diveSitesAPI.createDiveSite);
const updateDiveSite = vi.mocked(diveSitesAPI.updateDiveSite);
const { diveSiteCatalogAPI } = await import("@/lib/api/dive-site-catalog");
const suggestDiveSites = vi.mocked(diveSiteCatalogAPI.suggestDiveSites);

const THISTLEGORM = {
  name: "SS Thistlegorm",
  name_en: null,
  latitude: 27.814092,
  longitude: 33.920048,
  country: "Egypt",
  region: "South Sinai",
  source: "osm" as const,
  source_id: "node/255316037",
  external_id: { registry: "openstreetmap", identifier: "node/255316037" },
  held_site: null,
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
};

beforeEach(() => {
  account.user.units = "metric";
  localStorage.clear();
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue({ status: "unknown" });
  suggestDiveSites.mockReset();
  suggestDiveSites.mockResolvedValue({ results: [], has_more: false });
  createDiveSite.mockReset();
});

// `parseCoordinatePair` and the both-or-neither rule are unit-tested in
// `lib/validations/dive-site.test.ts`. What only a render reaches is the wiring
// around them: that the paste handler sits on *both* coordinate inputs rather
// than just the one a diver is expected to reach first, and that the a11y
// arrangement holds. That second one is the reason this file exists - the
// tempting simplification (one visible <p id> that both inputs point at with
// `aria-describedby`) looks identical on screen and drops the validation
// message from the accessibility tree, which no other check here would catch.

function renderDialog() {
  return render(
    <DiveSiteDialog open onOpenChange={() => {}} onSaved={() => {}} />,
  );
}

const latitude = () => screen.getByLabelText("Latitude") as HTMLInputElement;
const longitude = () => screen.getByLabelText("Longitude") as HTMLInputElement;

// What a screen reader would read out for a field, in order.
const describedBy = (input: HTMLElement) =>
  (input.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? null);

const pasteInto = (input: HTMLElement, text: string) => {
  const event = createEvent.paste(input, {
    clipboardData: { getData: () => text },
  });
  fireEvent(input, event);
  return event;
};

describe("DiveSiteDialog coordinate paste", () => {
  it("splits a pasted pair across both fields", () => {
    renderDialog();
    pasteInto(latitude(), "27.8506, 34.3136");

    expect(latitude().value).toBe("27.8506");
    expect(longitude().value).toBe("34.3136");
  });

  // The handler is on both inputs: a diver who tabs to Longitude first and
  // pastes there should get the same result, not a longitude of "27.8506".
  it("splits the same pair when it lands on the longitude field", () => {
    renderDialog();
    pasteInto(longitude(), "27.8506, 34.3136");

    expect(latitude().value).toBe("27.8506");
    expect(longitude().value).toBe("34.3136");
  });

  it("leaves a non-pair to paste normally", () => {
    renderDialog();
    const event = pasteInto(latitude(), "27°51'02.2\"N");

    expect(event.defaultPrevented).toBe(false);
    expect(latitude().value).toBe("");
    expect(longitude().value).toBe("");
  });

  // "-16,5" is -16.5 across most of Europe; splitting it would save the site in
  // the wrong ocean without erroring anywhere.
  it("leaves a European decimal comma alone", () => {
    renderDialog();
    const event = pasteInto(latitude(), "-16,5");

    expect(event.defaultPrevented).toBe(false);
    expect(longitude().value).toBe("");
  });

  // Pasting a pair copied off another map is placing the site just as much as
  // clicking on the map is, so it names the position the same way. The lookup
  // itself - and every guard around what it is allowed to overwrite - is
  // covered in `hooks/useGeocodedLocation.render.test.tsx`; what only the
  // dialog reaches is that the paste handler asks at all.
  it("names the pasted position, as if it had been placed on the map", async () => {
    reverseGeocode.mockResolvedValue({
      status: "named",
      result: {
        latitude: 27.85,
        longitude: 34.31,
        location: "Sharm El-Sheikh, Egypt",
        name: "Sharm El-Sheikh",
        attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
      },
    });
    renderDialog();
    pasteInto(latitude(), "27.8506, 34.3136");

    await waitFor(() =>
      expect(reverseGeocode).toHaveBeenCalledWith(27.8506, 34.3136),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Location")).toHaveValue(
        "Sharm El-Sheikh, Egypt",
      ),
    );
  });

  it("asks nothing about a paste that was not a pair", () => {
    renderDialog();
    pasteInto(latitude(), "27°51'02.2\"N");

    expect(reverseGeocode).not.toHaveBeenCalled();
  });
});

describe("DiveSiteDialog coordinate accessibility", () => {
  it("describes both coordinate fields with the pair-level paste hint", () => {
    renderDialog();

    for (const input of [latitude(), longitude()]) {
      expect(describedBy(input)).toEqual([
        expect.stringContaining("into either field to fill both"),
      ]);
    }
  });

  it("does not read the visible copy of the hint a second time", () => {
    renderDialog();
    const visible = screen.getByText(/into either field to fill both/, {
      selector: "p[aria-hidden]",
    });

    expect(visible).toBeInTheDocument();
  });

  // The regression this file is really guarding: `FormControl` supplies
  // `aria-describedby`, so an input that sets its own replaces it and silently
  // loses the error message.
  it("still announces the validation message alongside the hint", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Blue Hole" },
    });
    fireEvent.change(latitude(), { target: { value: "-8.7" } });
    fireEvent.click(screen.getByRole("button", { name: /Create dive site/ }));

    await screen.findByText("Longitude is required when latitude is given");

    expect(longitude()).toHaveAttribute("aria-invalid", "true");
    expect(describedBy(longitude())).toEqual([
      expect.stringContaining("into either field to fill both"),
      "Longitude is required when latitude is given",
    ]);
  });
});

// Picking a dive site out of the catalog, which is the one pick that fills the
// Name field. Driven through the real search rather than a stub, because what is
// under test is the whole chain: a tagged pick coming back from a menu row, and
// which of the form's fields each kind of row writes.
describe("DiveSiteDialog catalog picks", () => {
  const pickFirstSuggestion = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Search for a dive site or place"));
    await user.paste("thistlegorm");
    await user.click(
      await screen.findByRole(
        "option",
        { name: /SS Thistlegorm/ },
        {
          timeout: 2000,
        },
      ),
    );
  };

  it("fills the name, the location and the coordinate pair", async () => {
    // `region, country`, in English, and never an ISO code: this field is an
    // ordinary text input whose own example reads "Dahab, South Sinai, Egypt".
    suggestDiveSites.mockResolvedValue({
      results: [THISTLEGORM],
      has_more: false,
    });
    renderDialog();

    await pickFirstSuggestion();

    expect(screen.getByLabelText("Name *")).toHaveValue("SS Thistlegorm");
    expect(screen.getByLabelText("Location")).toHaveValue("South Sinai, Egypt");
    expect(latitude()).toHaveValue("27.814092");
    expect(longitude()).toHaveValue("33.920048");
  });

  it("writes over a name the diver had already typed", async () => {
    // The owner's call, reversing what a place pick does: a diver who wants
    // something else types over it, exactly as they already do with Location.
    // Filling it only when empty never clobbers anything, at the price of a rule
    // nobody can predict from looking at the form.
    suggestDiveSites.mockResolvedValue({
      results: [THISTLEGORM],
      has_more: false,
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "My house reef" },
    });

    await pickFirstSuggestion();

    expect(screen.getByLabelText("Name *")).toHaveValue("SS Thistlegorm");
  });

  it("leaves a typed location alone for a site that resolved to nowhere", async () => {
    // A few dozen records sit further than 50 km from any administrative
    // boundary and ship anyway. That is not an answer about where the site is,
    // so it is no grounds to empty a field the diver filled in - the same
    // distinction the reverse geocode already draws between "no name here" and
    // "we never got to ask".
    suggestDiveSites.mockResolvedValue({
      results: [{ ...THISTLEGORM, country: null, region: null }],
      has_more: false,
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Somewhere in the Red Sea" },
    });

    await pickFirstSuggestion();

    expect(screen.getByLabelText("Location")).toHaveValue(
      "Somewhere in the Red Sea",
    );
    // The rest of the pick still lands - it is only the Location it had nothing
    // to say about.
    expect(screen.getByLabelText("Name *")).toHaveValue("SS Thistlegorm");
    expect(latitude()).toHaveValue("27.814092");
  });

  it("looks nothing up for a pick that already knows where it is", async () => {
    // The catalog resolved the place when it was built, so a pick costs no
    // request beyond the search that produced it - in particular not the reverse
    // geocode a dropped pin fires.
    suggestDiveSites.mockResolvedValue({
      results: [THISTLEGORM],
      has_more: false,
    });
    renderDialog();

    await pickFirstSuggestion();

    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("credits the catalog for the location it just wrote", async () => {
    // The "Location from ..." line names whichever source supplied the value now
    // in the field, exactly as it names the geocoder for a place pick.
    suggestDiveSites.mockResolvedValue({
      results: [THISTLEGORM],
      has_more: false,
    });
    renderDialog();

    await pickFirstSuggestion();

    expect(screen.getByText(/Location from/)).toBeInTheDocument();
  });

  it("credits nothing for a site whose location it did not write", async () => {
    // Crediting a source for a value it did not supply would be a false
    // statement about the field the line sits under.
    suggestDiveSites.mockResolvedValue({
      results: [{ ...THISTLEGORM, country: null, region: null }],
      has_more: false,
    });
    renderDialog();

    await pickFirstSuggestion();

    expect(screen.queryByText(/Location from/)).not.toBeInTheDocument();
  });
});

describe("DiveSiteDialog API refusal", () => {
  // The catalog makes this a normal path rather than a rare one: it carries seven
  // records all named "Diving Spot" that resolve to the same "Banten, Indonesia", so
  // a diver adding two of them in turn meets this refusal by design. The documented
  // recovery is that they edit the name, which needs them to know the save was
  // refused - and until the region below was permanent, a screen reader said nothing
  // and the submit read as doing nothing at all.
  it("announces a refused save from a region that was already mounted", async () => {
    createDiveSite.mockRejectedValue({
      response: {
        data: {
          detail: "A dive site with this name already exists at this location",
        },
      },
    });
    renderDialog();

    // Present, and silent, before the save is even attempted. This is the half that
    // a `{apiError && <p>}` cannot do: the region has to be registered *before* the
    // message lands in it.
    const region = screen.getByRole("alert");
    expect(region).toBeEmptyDOMElement();

    await userEvent.type(screen.getByLabelText("Name *"), "Diving Spot");
    await userEvent.click(
      screen.getByRole("button", { name: /Create dive site/ }),
    );

    await waitFor(() =>
      expect(region).toHaveTextContent(
        "A dive site with this name already exists at this location",
      ),
    );
    // The same node throughout, so what a screen reader announces is a change
    // inside a region it already knows about.
    expect(screen.getByRole("alert")).toBe(region);
  });

  it("leaves the dialog open and editable so the diver can fix the name", async () => {
    createDiveSite.mockRejectedValue({
      response: {
        data: { detail: "A dive site with this name already exists" },
      },
    });
    renderDialog();

    await userEvent.type(screen.getByLabelText("Name *"), "Diving Spot");
    await userEvent.click(
      screen.getByRole("button", { name: /Create dive site/ }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/already exists/),
    );

    const name = screen.getByLabelText("Name *") as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, "Diving Spot (west)");
    expect(name.value).toBe("Diving Spot (west)");
  });
});

// The Location field holds a whole place and shows only its name, so what the
// field looks like says nothing about what a save sends. Only a save does, and
// there is no way back from one: the migration that made the member an object
// does not run twice.
describe("DiveSiteDialog location writes", () => {
  const PLACE = {
    name: "Dahab, Egypt",
    latitude: 28.4949,
    longitude: 34.5136,
    bbox_south: 28.45,
    bbox_north: 28.54,
    bbox_west: 34.47,
    bbox_east: 34.55,
  };
  const PICKED = {
    uuid: "site-1",
    name: "Blue Hole",
    // Read the way an API that still returns `full_name` sends it. The API
    // that stops returning it also refuses it on write, and a dialog opened
    // before that deploy may save after it - so a save must not echo it.
    location: { ...PLACE, full_name: "Dahab, South Sinai, 45214, Egypt" },
    latitude: 28.5717,
    longitude: 34.5372,
    notes: "",
    user_uuid: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  };

  const renderEdit = () =>
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        diveSite={PICKED}
        onSaved={() => {}}
      />,
    );

  const save = () =>
    userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

  beforeEach(() => {
    updateDiveSite.mockReset();
    updateDiveSite.mockResolvedValue({ message: "ok" });
  });

  it("sends the whole place back when only the site's name changed", async () => {
    // The field shows "Dahab, Egypt" and nothing else, so a control bound to
    // that string alone would post a place carrying only a name - silently
    // dropping the locality's centre and its extent on every edit of every
    // site anyone has ever picked a place for. The place goes back as the form
    // declares it, so a member the read carried and the form does not know
    // stays behind.
    renderEdit();
    const name = screen.getByLabelText("Name *") as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, "Blue Hole (north entry)");
    await save();

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1]).toMatchObject({
      name: "Blue Hole (north entry)",
    });
    expect(updateDiveSite.mock.calls[0][1].location).toEqual(PLACE);
  });

  it("clears the place with an explicit null, not an empty name", async () => {
    // How a site entered with the wrong locality is corrected back to "not
    // recorded". An omitted member would leave the old one in place, and a
    // place named "" is a place whose name is not one.
    renderEdit();
    await userEvent.clear(screen.getByLabelText("Location"));
    await save();

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].location).toBeNull();
  });

  it("stops a typed name at the width the API stores", async () => {
    // Not left to the resolver: the failure would land at `location.name`,
    // where `FormMessage` reads `errors.location` and finds a container with
    // no message - the word "undefined" in red, over a save that stopped.
    renderEdit();
    const location = screen.getByLabelText("Location") as HTMLInputElement;
    expect(location.maxLength).toBe(255);

    await userEvent.clear(location);
    await userEvent.paste("a".repeat(300));
    await save();

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].location).toEqual({
      name: "a".repeat(255),
    });
  });

  it("replaces the place outright when a new name is typed over it", async () => {
    // A centre and an extent resolved for Dahab say nothing true
    // about Moalboal, so they go with the name they belonged to rather than
    // being carried over onto it.
    renderEdit();
    const location = screen.getByLabelText("Location");
    await userEvent.clear(location);
    await userEvent.type(location, "Moalboal, Philippines");
    await save();

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].location).toEqual({
      name: "Moalboal, Philippines",
    });
  });
});

// What a save sends of the members beside the name and the place: every one, in
// metres whatever the diver typed in.
describe("DiveSiteDialog members", () => {
  beforeEach(() => {
    createDiveSite.mockResolvedValue({
      uuid: "site-new",
      name: "Sunabe Seawall",
      user_uuid: "user-1",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  const create = () =>
    userEvent.click(screen.getByRole("button", { name: /Create dive site/ }));

  it("sends each member a new site was given", async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Sunabe Seawall" },
    });
    await user.click(screen.getByRole("button", { name: "Add a name" }));
    await user.type(screen.getByLabelText("Other name 1"), "砂辺");
    await user.type(screen.getByLabelText(/^Depth from/), "3");
    await user.type(screen.getByLabelText(/^Depth to/), "18");
    await user.selectOptions(screen.getByLabelText("Water type"), "salt");
    await user.type(screen.getByLabelText(/^Altitude/), "2");
    await user.click(screen.getByRole("checkbox", { name: "Shore" }));
    await user.click(screen.getByRole("checkbox", { name: "Pier" }));
    await user.type(screen.getByLabelText("Tags"), "shore dive{Enter}");

    await create();

    await waitFor(() => expect(createDiveSite).toHaveBeenCalled());
    expect(createDiveSite.mock.calls[0][0]).toMatchObject({
      name: "Sunabe Seawall",
      other_names: ["砂辺"],
      external_ids: [],
      depth_from: 3,
      depth_to: 18,
      water_type: "salt",
      altitude: 2,
      entry_types: ["shore", "pier"],
      tags: ["shore dive"],
    });
  });

  it("sends feet and an altitude in feet as metres", async () => {
    account.user.units = "imperial";
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Spiegel Grove" },
    });
    await user.type(screen.getByLabelText(/^Depth from \(ft\)/), "15");
    await user.type(screen.getByLabelText(/^Depth to \(ft\)/), "100");
    await user.type(screen.getByLabelText(/^Altitude \(ft\)/), "6000");

    await create();

    await waitFor(() => expect(createDiveSite).toHaveBeenCalled());
    expect(createDiveSite.mock.calls[0][0]).toMatchObject({
      depth_from: 4.57,
      depth_to: 30.48,
      altitude: 1829,
    });
  });

  it("refuses a range whose deep end is shallower than its shallow one", async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Blue Hole" },
    });
    await user.type(screen.getByLabelText(/^Depth from/), "30");
    await user.type(screen.getByLabelText(/^Depth to/), "5");

    await create();

    expect(
      await screen.findByText("Depth to cannot be shallower than depth from"),
    ).toBeInTheDocument();
    expect(createDiveSite).not.toHaveBeenCalled();
  });
});

// A catalogue pick keeps the row's registry entry, and a row the diver already
// holds a site for is offered before anything is made.
describe("DiveSiteDialog registry entries", () => {
  const DUNRAVEN = {
    ...THISTLEGORM,
    name: "SS Dunraven",
    latitude: 27.705,
    longitude: 34.121,
    source: "wikidata" as const,
    source_id: "Q7393932",
    external_id: { registry: "wikidata", identifier: "Q7393932" },
    attribution:
      "[Data from Wikidata, CC0 1.0.](https://www.wikidata.org/wiki/Wikidata:Licensing)",
  };
  const THISTLEGORM_ENTRY = THISTLEGORM.external_id;
  const HELD = {
    uuid: "site-held",
    name: "Thistlegorm wreck",
    user_uuid: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  };

  const pick = async (query: string, name: RegExp) => {
    const user = userEvent.setup();
    const search = screen.getByLabelText("Search for a dive site or place");
    await user.clear(search);
    await user.click(search);
    await user.paste(query);
    await user.click(
      await screen.findByRole("option", { name }, { timeout: 2000 }),
    );
  };

  const registries = () =>
    within(screen.getByRole("group", { name: "In other registries" }));

  beforeEach(() => {
    suggestDiveSites.mockImplementation(async (query: string) => ({
      results: /dunraven/i.test(query) ? [DUNRAVEN] : [THISTLEGORM],
      has_more: false,
    }));
    createDiveSite.mockResolvedValue({ ...HELD, uuid: "site-new" });
    updateDiveSite.mockReset();
    updateDiveSite.mockResolvedValue({ message: "ok" });
  });

  it("keeps the picked row's entry, and links it", async () => {
    renderDialog();

    await pick("thistlegorm", /SS Thistlegorm/);

    expect(
      registries().getByRole("link", { name: /OpenStreetMap node\/255316037/ }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/node/255316037");
    await userEvent.click(
      screen.getByRole("button", { name: /Create dive site/ }),
    );
    await waitFor(() => expect(createDiveSite).toHaveBeenCalled());
    expect(createDiveSite.mock.calls[0][0].external_ids).toEqual([
      THISTLEGORM_ENTRY,
    ]);
  });

  it("replaces an earlier pick's entry rather than adding beside it", async () => {
    renderDialog();

    await pick("thistlegorm", /SS Thistlegorm/);
    await pick("dunraven", /SS Dunraven/);
    await userEvent.click(
      screen.getByRole("button", { name: /Create dive site/ }),
    );

    await waitFor(() => expect(createDiveSite).toHaveBeenCalled());
    expect(createDiveSite.mock.calls[0][0]).toMatchObject({
      name: "SS Dunraven",
      external_ids: [DUNRAVEN.external_id],
    });
  });

  it("keeps the entries a site carried, and adds a re-picked one once", async () => {
    const carried = { registry: "wrecksite", identifier: "10021" };
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        diveSite={{
          ...HELD,
          external_ids: [carried, THISTLEGORM_ENTRY],
        }}
      />,
    );

    // Not a link: the format names no form for this registry's identifiers.
    expect(
      registries()
        .getByText(/wrecksite/)
        .closest("a"),
    ).toBeNull();
    await pick("dunraven", /SS Dunraven/);
    await pick("thistlegorm", /SS Thistlegorm/);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1]).toMatchObject({
      name: "SS Thistlegorm",
      external_ids: [carried, THISTLEGORM_ENTRY],
    });
  });

  it("removes an entry the diver takes off", async () => {
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        diveSite={{ ...HELD, external_ids: [THISTLEGORM_ENTRY] }}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove OpenStreetMap node/255316037",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].external_ids).toEqual([]);
  });

  it("hands back the saved site as the API reads it", async () => {
    const onSaved = vi.fn();
    const saved = { ...HELD, tags: ["Wreck"], dive_count: 3 };
    vi.mocked(diveSitesAPI.getDiveSite).mockResolvedValue(saved);
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        diveSite={HELD}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  // The save went through; the picture the site named may show its old pin.
  it("hands back the assembled site, without its picture, when the read fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const onSaved = vi.fn();
    vi.mocked(diveSitesAPI.getDiveSite).mockRejectedValue(
      new Error("Network Error"),
    );
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        diveSite={{ ...HELD, map_picture: "digest-before" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      uuid: HELD.uuid,
      map_picture: null,
    });
    quiet.mockRestore();
  });

  describe("a row the diver already holds", () => {
    beforeEach(() => {
      suggestDiveSites.mockResolvedValue({
        results: [
          { ...THISTLEGORM, held_site: { uuid: HELD.uuid, name: HELD.name } },
        ],
        has_more: false,
      });
    });

    it("offers the held site and fills nothing until answered", async () => {
      renderDialog();

      await pick("thistlegorm", /SS Thistlegorm/);

      // In a live region that was already there, so it is announced.
      const offer = (await screen.findByText(/You already have/)).closest(
        "[role=status]",
      );
      expect(offer).toHaveTextContent("Thistlegorm wreck");
      expect(screen.getByLabelText("Name *")).toHaveValue("");
      expect(
        screen.queryByRole("group", { name: "In other registries" }),
      ).not.toBeInTheDocument();
    });

    it("hands the held site back, and creates nothing, when the offer is taken", async () => {
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      vi.mocked(diveSitesAPI.getDiveSite).mockResolvedValue(HELD);
      render(
        <DiveSiteDialog open onOpenChange={onOpenChange} onSaved={onSaved} />,
      );

      await pick("thistlegorm", /SS Thistlegorm/);
      await userEvent.click(
        await screen.findByRole("button", { name: "Use Thistlegorm wreck" }),
      );

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(HELD));
      expect(diveSitesAPI.getDiveSite).toHaveBeenCalledWith("site-held");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(createDiveSite).not.toHaveBeenCalled();
    });

    it("fills the form from the row, entry and all, when it is declined", async () => {
      renderDialog();

      await pick("thistlegorm", /SS Thistlegorm/);
      await userEvent.click(
        await screen.findByRole("button", { name: "Make a new site" }),
      );

      expect(screen.getByLabelText("Name *")).toHaveValue("SS Thistlegorm");
      expect(screen.queryByText(/You already have/)).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: /Create dive site/ }),
      );
      await waitFor(() => expect(createDiveSite).toHaveBeenCalled());
      expect(createDiveSite.mock.calls[0][0].external_ids).toEqual([
        THISTLEGORM_ENTRY,
      ]);
    });

    // An edit fills the site being edited, which may be the very site the row
    // names; there is nothing to offer in its place.
    it("offers nothing while editing, and fills as any pick does", async () => {
      render(
        <DiveSiteDialog
          open
          onOpenChange={() => {}}
          onSaved={() => {}}
          diveSite={HELD}
        />,
      );

      await pick("thistlegorm", /SS Thistlegorm/);

      expect(screen.queryByText(/You already have/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Name *")).toHaveValue("SS Thistlegorm");
    });
  });
});
