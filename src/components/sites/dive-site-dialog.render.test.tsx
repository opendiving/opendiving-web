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
import type { DiveSite, DiveSiteLookupItem } from "@/lib/api/dive-sites";

// The real constants, with only the transport replaced.
vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: {
    createDiveSite: vi.fn(),
    updateDiveSite: vi.fn(),
    getDiveSite: vi.fn(),
    saveDiveSite: vi.fn(),
    searchCommonsSites: vi.fn(),
  },
}));

// The tags picker reads the diver's vocabulary on mount.
vi.mock("@/lib/api/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/tags")>()),
  fetchAllTags: vi.fn().mockResolvedValue([]),
}));

// The real constants - the debounce and the query bounds the field hands the
// combobox - with only the transport replaced.
vi.mock("@/lib/api/geocoding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/geocoding")>()),
  geocodingAPI: {
    reverseGeocode: vi.fn(),
    searchPlaces: vi.fn().mockResolvedValue([]),
  },
}));

// The search puts a distance on its rows, and the depths and the altitude are
// typed, in the units read off the diver's account.
const account = vi.hoisted(() => ({
  user: { uuid: "user-1", units: "metric" as "metric" | "imperial" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => account,
}));
const instance = vi.hoisted(() => ({
  config: null as { commons_primary: boolean } | null,
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: instance.config, isLoading: false }),
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const createDiveSite = vi.mocked(diveSitesAPI.createDiveSite);
const updateDiveSite = vi.mocked(diveSitesAPI.updateDiveSite);
const saveDiveSite = vi.mocked(diveSitesAPI.saveDiveSite);
const searchCommonsSites = vi.mocked(diveSitesAPI.searchCommonsSites);

const THISTLEGORM: DiveSiteLookupItem = {
  uuid: "commons-thistlegorm",
  name: "SS Thistlegorm",
  latitude: 27.814092,
  longitude: 33.920048,
  location: { name: "South Sinai, Egypt" },
  external_ids: [{ registry: "openstreetmap", identifier: "node/255316037" }],
  owner: "opendivingcommons",
  saved: false,
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
};

beforeEach(() => {
  instance.config = null;
  account.user.units = "metric";
  localStorage.clear();
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue({ status: "unknown" });
  vi.mocked(geocodingAPI.searchPlaces).mockResolvedValue([]);
  searchCommonsSites.mockReset();
  searchCommonsSites.mockResolvedValue({ data: [], has_more: false });
  saveDiveSite.mockReset();
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

// Opens the location search from beside the Location field, picks a row from it
// and - unless told not to - takes it back into the form with "Use location".
const searchLocation = async (
  query: string,
  name: RegExp,
  { use = true }: { use?: boolean } = {},
) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Search location" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "Search location" }),
  );
  const search = dialog.getByRole("combobox");
  await user.clear(search);
  await user.click(search);
  await user.paste(query);
  await user.click(
    await dialog.findByRole("option", { name }, { timeout: 2000 }),
  );
  if (use) await clickUseLocation();
};

const clickUseLocation = () =>
  userEvent.click(
    within(screen.getByRole("dialog", { name: "Search location" })).getByRole(
      "button",
      { name: "Use location" },
    ),
  );

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

// Driven through the real search rather than a stub, because what is under test
// is the whole chain: a tagged pick coming back from a menu row, and that no row
// of this kind ever reaches the form.
describe("DiveSiteDialog Commons sites", () => {
  const OWN_SITE: DiveSite = {
    uuid: "site-own",
    name: "House reef",
    owner: "account",
    saved: true,
    attribution: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const SAVED: DiveSite = {
    ...THISTLEGORM,
    saved: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    searchCommonsSites.mockResolvedValue({
      data: [THISTLEGORM],
      has_more: false,
    });
    saveDiveSite.mockResolvedValue(SAVED);
  });

  it("offers the record, and fills nothing", async () => {
    renderDialog();

    await searchLocation("thistlegorm", /SS Thistlegorm/, { use: false });

    // In a live region that was already there, so it is announced.
    const offer = (await screen.findByText(/is in OpenDiving Commons/)).closest(
      "[role=status]",
    );
    expect(offer).toHaveTextContent("SS Thistlegorm");
    expect(screen.getByLabelText("Name *")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Make a new site" }),
    ).not.toBeInTheDocument();
    expect(saveDiveSite).not.toHaveBeenCalled();
  });

  it("leaves the form as it was through Use location", async () => {
    renderDialog();

    await searchLocation("thistlegorm", /SS Thistlegorm/);

    expect(screen.getByLabelText("Name *")).toHaveValue("");
    expect(latitude()).toHaveValue("");
    expect(screen.getByLabelText("Location")).toHaveValue("");
    expect(
      screen.queryByRole("group", { name: "In other registries" }),
    ).not.toBeInTheDocument();
  });

  it("saves the record and hands it back, creating nothing, when taken", async () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DiveSiteDialog open onOpenChange={onOpenChange} onSaved={onSaved} />,
    );

    await searchLocation("thistlegorm", /SS Thistlegorm/, { use: false });
    await userEvent.click(
      await screen.findByRole("button", { name: "Use SS Thistlegorm" }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED, false));
    expect(saveDiveSite).toHaveBeenCalledWith("commons-thistlegorm");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createDiveSite).not.toHaveBeenCalled();
  });

  it("stays open and says so when the save fails", async () => {
    saveDiveSite.mockRejectedValue(new Error("offline"));
    const onSaved = vi.fn();
    render(<DiveSiteDialog open onOpenChange={() => {}} onSaved={onSaved} />);

    await searchLocation("thistlegorm", /SS Thistlegorm/, { use: false });
    await userEvent.click(
      await screen.findByRole("button", { name: "Use SS Thistlegorm" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to save that dive site",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("searches places alone while editing", async () => {
    vi.mocked(geocodingAPI.searchPlaces).mockResolvedValue([
      {
        latitude: 28.4954,
        longitude: 34.5197,
        location: "Dahab, South Sinai, Egypt",
        name: "Dahab",
        attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
      },
    ]);
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        diveSite={OWN_SITE}
      />,
    );

    await searchLocation("dahab", /Dahab/);

    expect(searchCommonsSites).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name *")).toHaveValue("House reef");
  });
});

describe("DiveSiteDialog location search", () => {
  const DAHAB = {
    latitude: 28.4954,
    longitude: 34.5197,
    location: "Dahab, South Sinai, Egypt",
    name: "Dahab",
    attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
  };
  const searchDialog = () =>
    within(screen.getByRole("dialog", { name: "Search location" }));
  const openSearch = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "Search location" }),
    );
    await screen.findByRole("dialog", { name: "Search location" });
  };

  it("names the form's position on opening, as though its pin had just been placed", async () => {
    reverseGeocode.mockResolvedValue({ status: "named", result: DAHAB });
    renderDialog();
    pasteInto(latitude(), "28.5717, 34.5372");
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Somewhere else" },
    });
    reverseGeocode.mockClear();

    await openSearch();

    expect(reverseGeocode).toHaveBeenCalledWith(28.5717, 34.5372);
    await waitFor(() =>
      expect(searchDialog().getByRole("combobox")).toHaveValue(
        "Dahab, South Sinai, Egypt",
      ),
    );
    expect(searchDialog().getByLabelText("Latitude")).toHaveValue("28.5717");
  });

  it("searches for the form's location when it has no position", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Thistlegorm" },
    });

    await openSearch();

    expect(searchDialog().getByRole("combobox")).toHaveValue("Thistlegorm");
    await waitFor(
      () =>
        expect(searchCommonsSites).toHaveBeenCalledWith("Thistlegorm", null),
      { timeout: 2000 },
    );
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("writes a picked place's position and name into the form, and leaves Name alone", async () => {
    vi.mocked(geocodingAPI.searchPlaces).mockResolvedValue([DAHAB]);
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Lighthouse" },
    });

    await searchLocation("dahab", /Dahab/);

    expect(
      screen.queryByRole("dialog", { name: "Search location" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toHaveValue(
      "Dahab, South Sinai, Egypt",
    );
    expect(latitude()).toHaveValue("28.4954");
    expect(longitude()).toHaveValue("34.5197");
    expect(screen.getByLabelText("Name *")).toHaveValue("Lighthouse");
    expect(screen.getByText(/Location from/)).toBeInTheDocument();
  });

  it("leaves the form as it was when cancelled", async () => {
    vi.mocked(geocodingAPI.searchPlaces).mockResolvedValue([DAHAB]);
    renderDialog();

    await searchLocation("dahab", /Dahab/, { use: false });
    await userEvent.click(
      searchDialog().getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Search location" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Location")).toHaveValue("");
    expect(latitude()).toHaveValue("");
  });

  it("will not hand back half a position", async () => {
    renderDialog();
    await openSearch();

    fireEvent.change(searchDialog().getByLabelText("Latitude"), {
      target: { value: "28.5" },
    });

    expect(
      searchDialog().getByRole("button", { name: "Use location" }),
    ).toBeDisabled();
  });
});

describe("DiveSiteDialog API refusal", () => {
  // The recovery is that the diver edits the name, which needs them to know the
  // save was refused - a submit with no permanent region reads to a screen reader
  // as doing nothing at all.
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

  it("shows a name already taken at the locality on the name field", async () => {
    const taken = "A dive site with this name already exists at this location";
    createDiveSite.mockRejectedValue({
      response: { status: 422, data: { detail: taken } },
    });
    renderDialog();

    const name = screen.getByLabelText("Name *");
    await userEvent.type(name, "Diving Spot");
    await userEvent.click(
      screen.getByRole("button", { name: /Create dive site/ }),
    );

    const shown = await screen.findByText(taken);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(describedBy(name)).toContain(shown.textContent);
    expect(name).toHaveFocus();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
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
    owner: "account" as const,
    saved: true,
    attribution: null,
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

  it("sends a typed name trimmed, as the API stores it", async () => {
    renderEdit();
    const location = screen.getByLabelText("Location");
    await userEvent.clear(location);
    await userEvent.type(location, "  Moalboal  ");
    await save();

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].location).toEqual({
      name: "Moalboal",
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
      owner: "account",
      saved: true,
      attribution: null,
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

// An entry arrives with an import: the form shows it and lets it go, and adds none.
describe("DiveSiteDialog registry entries", () => {
  const ENTRY = { registry: "openstreetmap", identifier: "node/255316037" };
  const OWN_SITE: DiveSite = {
    uuid: "site-own",
    name: "Thistlegorm wreck",
    owner: "account",
    saved: true,
    attribution: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  const registries = () =>
    within(screen.getByRole("group", { name: "In other registries" }));

  beforeEach(() => {
    updateDiveSite.mockReset();
    updateDiveSite.mockResolvedValue({ message: "ok" });
  });

  it("keeps the entries a site carried, linking the ones it can", async () => {
    const carried = { registry: "wrecksite", identifier: "10021" };
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        diveSite={{ ...OWN_SITE, external_ids: [carried, ENTRY] }}
      />,
    );

    expect(
      registries().getByRole("link", { name: /OpenStreetMap node\/255316037/ }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/node/255316037");
    // Not a link: the format names no form for this registry's identifiers.
    expect(
      registries()
        .getByText(/wrecksite/)
        .closest("a"),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(updateDiveSite).toHaveBeenCalled());
    expect(updateDiveSite.mock.calls[0][1].external_ids).toEqual([
      carried,
      ENTRY,
    ]);
  });

  it("removes an entry the diver takes off", async () => {
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        diveSite={{ ...OWN_SITE, external_ids: [ENTRY] }}
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
    const saved = { ...OWN_SITE, tags: ["Wreck"], dive_count: 3 };
    vi.mocked(diveSitesAPI.getDiveSite).mockResolvedValue(saved);
    render(
      <DiveSiteDialog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        diveSite={OWN_SITE}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, false));
  });

  describe("the choice of private or public", () => {
    const choice = () =>
      screen.queryByRole("radiogroup", { name: "Visibility" });
    const radio = (name: RegExp) => screen.getByRole("radio", { name });
    const WAITING = {
      uuid: "proposal-1",
      kind: "new_site",
      status: "waiting",
      reason: null,
      created_at: "2026-01-01T00:00:00Z",
      decided_at: null,
    } as const;
    const editing = (
      site: DiveSite,
      over: Partial<React.ComponentProps<typeof DiveSiteDialog>> = {},
    ) => {
      const onSaved = vi.fn();
      vi.mocked(diveSitesAPI.getDiveSite).mockResolvedValue(site);
      render(
        <DiveSiteDialog
          open
          onOpenChange={() => {}}
          onSaved={onSaved}
          diveSite={site}
          {...over}
        />,
      );
      return onSaved;
    };
    const save = () =>
      userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    beforeEach(() => {
      instance.config = { commons_primary: true };
    });

    it("shows only where the Commons is edited, and a null config is not that", () => {
      const { unmount } = renderDialog();
      expect(choice()).toBeInTheDocument();
      expect(radio(/^Private/)).toBeChecked();
      unmount();

      instance.config = { commons_primary: false };
      const second = renderDialog();
      expect(choice()).not.toBeInTheDocument();
      second.unmount();

      instance.config = null;
      renderDialog();
      expect(choice()).not.toBeInTheDocument();
    });

    it("is never on a Commons record", () => {
      editing({ ...OWN_SITE, owner: "opendivingcommons" });
      expect(choice()).not.toBeInTheDocument();
    });

    it("is not on the form the review step's Edit opens", () => {
      editing(OWN_SITE, { offersChoice: false });
      expect(choice()).not.toBeInTheDocument();
    });

    it("sends the same body either way, and says Public was chosen", async () => {
      const onSaved = editing(OWN_SITE);
      await save();
      await waitFor(() =>
        expect(onSaved).toHaveBeenCalledWith(OWN_SITE, false),
      );
      const privateBody = updateDiveSite.mock.lastCall?.[1];

      await userEvent.click(radio(/^Public/));
      await save();

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(OWN_SITE, true));
      expect(updateDiveSite.mock.lastCall?.[1]).toEqual(privateBody);
    });

    it("locks on Public while a proposal waits, and a save proposes nothing", async () => {
      const site = { ...OWN_SITE, proposal: WAITING };
      const onSaved = editing(site);

      expect(radio(/^Public/)).toBeChecked();
      expect(radio(/^Public/)).toBeDisabled();
      expect(radio(/^Private/)).toBeDisabled();
      expect(choice()).toHaveAccessibleDescription(
        /waiting for review.*Withdraw/,
      );

      await save();
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(site, false));
    });

    it("reads Private after a decline, and can be chosen again", async () => {
      const site = {
        ...OWN_SITE,
        proposal: { ...WAITING, status: "declined", reason: "Duplicate" },
      } as DiveSite;
      const onSaved = editing(site);

      expect(radio(/^Private/)).toBeChecked();
      await userEvent.click(radio(/^Public/));
      await save();

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(site, true));
    });

    it("hands a new site back with the choice", async () => {
      const onSaved = vi.fn();
      createDiveSite.mockResolvedValue(OWN_SITE);
      render(<DiveSiteDialog open onOpenChange={() => {}} onSaved={onSaved} />);

      await userEvent.type(screen.getByLabelText("Name *"), "Walk Reef");
      await userEvent.click(radio(/^Public/));
      await userEvent.click(
        screen.getByRole("button", { name: /Create dive site/ }),
      );

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(OWN_SITE, true));
    });

    it("reads Private again the next time the form opens", async () => {
      const props = {
        onOpenChange: () => {},
        onSaved: () => {},
        diveSite: OWN_SITE,
      };
      const { rerender } = render(<DiveSiteDialog open {...props} />);
      await userEvent.click(radio(/^Public/));

      rerender(<DiveSiteDialog open={false} {...props} />);
      rerender(<DiveSiteDialog open {...props} />);

      expect(
        await screen.findByRole("radio", { name: /^Private/ }),
      ).toBeChecked();
    });
  });
});
