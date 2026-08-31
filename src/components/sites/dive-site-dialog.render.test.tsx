import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteDialog } from "./dive-site-dialog";

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { createDiveSite: vi.fn(), updateDiveSite: vi.fn() },
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

// The search puts a distance on its rows, and that is read off the diver's
// account.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const createDiveSite = vi.mocked(diveSitesAPI.createDiveSite);
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
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
};

beforeEach(() => {
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
    <DiveSiteDialog
      userId="user-1"
      open
      onOpenChange={() => {}}
      onSaved={() => {}}
    />,
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
        display_name: "Sharm El-Sheikh, South Sinai, Egypt",
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
    fireEvent.click(screen.getByRole("button", { name: /Create Dive Site/ }));

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
    await user.click(screen.getByRole("combobox"));
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
    // ordinary text input whose own example reads "Dahab, Egypt".
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
      screen.getByRole("button", { name: /Create Dive Site/ }),
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
      screen.getByRole("button", { name: /Create Dive Site/ }),
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
