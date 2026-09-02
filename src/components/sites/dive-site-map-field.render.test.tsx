import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveSiteMapField } from "./dive-site-map-field";
import type { GeocodeResult } from "@/lib/api/geocoding";
import type { PlacePick } from "./place-search";

const BLUE_HOLE = { latitude: 28.5717, longitude: 34.5372 };

const RESULT: GeocodeResult = {
  latitude: 28.4954,
  longitude: 34.5197,
  location: "Dahab, Egypt",
  display_name: "Dahab, South Sinai, 45214, Egypt",
  name: "Dahab",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

// The map is covered by `map-picker.browser.test.tsx` and the search by
// `place-search.render.test.tsx`; here each only needs to be something that can
// hand a pick over. Stubbing them keeps a WebGL map, `next/dynamic` and a
// debounced round trip out of the way of what this file is about - which is the
// wiring between the two of them and the form.
vi.mock("./map-picker", () => ({
  MapPicker: ({ onPick }: { onPick: (p: unknown) => void }) => (
    <button type="button" onClick={() => onPick(BLUE_HOLE)}>
      place the pin
    </button>
  ),
}));

vi.mock("./place-search", () => ({
  PlaceSearch: ({
    onPick,
    position,
  }: {
    onPick: (pick: PlacePick) => void;
    position?: { latitude: number; longitude: number } | null;
  }) => (
    <button
      type="button"
      onClick={() => onPick({ kind: "geocode", result: RESULT })}
    >
      pick a place
      {position ? ` near ${position.latitude},${position.longitude}` : ""}
    </button>
  ),
}));

function renderField(props: Partial<{ onPick: () => void }> = {}) {
  return render(
    <DiveSiteMapField
      latitude=""
      longitude=""
      onPick={vi.fn()}
      onPickPlace={vi.fn()}
      announcement=""
      {...props}
    />,
  );
}

// The map is always shown; `next/dynamic` still resolves it asynchronously.
const placePin = () => screen.findByRole("button", { name: "place the pin" });

describe("DiveSiteMapField", () => {
  it("writes the placed position into the coordinate fields", async () => {
    // The map deals in numbers and the form in strings, and this is the only
    // place that converts between them.
    const onPick = vi.fn();
    renderField({ onPick });
    (await placePin()).click();

    expect(onPick).toHaveBeenCalledWith({
      latitude: "28.5717",
      longitude: "34.5372",
    });
  });

  it("hands a searched row on whole, still tagged", async () => {
    // Unconverted, and untouched: a picked row carries a name as well as a
    // position, and only the dialog knows which fields each kind fills - a
    // geocoded place writes the pair and the Location, a catalog dive site
    // writes the Name as well.
    const onPickPlace = vi.fn();
    render(
      <DiveSiteMapField
        latitude=""
        longitude=""
        onPick={vi.fn()}
        onPickPlace={onPickPlace}
        announcement=""
      />,
    );
    screen.getByRole("button", { name: /pick a place/ }).click();

    expect(onPickPlace).toHaveBeenCalledWith({
      kind: "geocode",
      result: RESULT,
    });
  });

  it("passes the form's position down to the search", async () => {
    // So the catalog can rank a same-name cluster nearest first. Parsed here
    // once, for the map, rather than a second time inside the search.
    render(
      <DiveSiteMapField
        latitude="27.8506"
        longitude="34.3136"
        onPick={vi.fn()}
        onPickPlace={vi.fn()}
        announcement=""
      />,
    );

    expect(
      screen.getByRole("button", { name: "pick a place near 27.8506,34.3136" }),
    ).toBeInTheDocument();
  });

  it("sends no position while the coordinate fields are unusable", async () => {
    // Half a pair, or a half-typed number, is not a position - and the endpoint
    // answers 422 to one coordinate without the other.
    render(
      <DiveSiteMapField
        latitude="27.8506"
        longitude=""
        onPick={vi.fn()}
        onPickPlace={vi.fn()}
        announcement=""
      />,
    );

    expect(
      screen.getByRole("button", { name: "pick a place" }),
    ).toBeInTheDocument();
  });

  // The API folds the licence URL into the credit as a markdown link, so this
  // line renders the string rather than printing it. Printed, a diver would
  // read "Location from [Data © OpenStreetMap contributors, ODbL
  // 1.0.](https://osm.org/copyright)".
  it("renders the credit's licence link rather than its markdown", () => {
    render(
      <DiveSiteMapField
        latitude="28.5717"
        longitude="34.5372"
        onPick={vi.fn()}
        onPickPlace={vi.fn()}
        credit="[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)"
        announcement=""
      />,
    );

    const link = screen.getByRole("link", {
      name: "Data © OpenStreetMap contributors, ODbL 1.0.",
    });
    expect(link).toHaveAttribute("href", "https://osm.org/copyright");
    expect(screen.queryByText(/\[Data ©/)).not.toBeInTheDocument();
  });

  // An older API - or a self-hoster's geocoder - sends the credit as plain
  // prose, which has to keep working exactly as it did.
  it("renders a credit that carries no link at all", () => {
    render(
      <DiveSiteMapField
        latitude="28.5717"
        longitude="34.5372"
        onPick={vi.fn()}
        onPickPlace={vi.fn()}
        credit="Data © OpenStreetMap contributors, ODbL 1.0."
        announcement=""
      />,
    );

    expect(screen.getByText(/Location from/)).toBeInTheDocument();
    expect(
      screen.getByText(/OpenStreetMap contributors, ODbL/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says out loud what the Location field did to itself", () => {
    // The field writes itself a round trip after the position was placed, and
    // nobody is looking at it when it happens.
    render(
      <DiveSiteMapField
        latitude="28.5717"
        longitude="34.5372"
        onPick={vi.fn()}
        onPickPlace={vi.fn()}
        announcement="Location set to Dahab, Egypt."
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Location set to Dahab, Egypt.",
    );
  });
});
