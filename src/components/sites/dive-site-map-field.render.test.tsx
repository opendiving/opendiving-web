import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { DiveSiteMapField } from "./dive-site-map-field";
import { geocodingAPI, GeocodeResult } from "@/lib/api/geocoding";

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { reverseGeocode: vi.fn() },
}));

// The map itself is covered by `map-picker.render.test.tsx`; here it only needs
// to be something that can hand a position over, and stubbing it keeps the tile
// grid and `next/dynamic` out of the way.
vi.mock("./map-picker", () => ({
  MapPicker: ({ onPick }: { onPick: (p: unknown) => void }) => (
    <button type="button" onClick={() => onPick(BLUE_HOLE)}>
      place the pin
    </button>
  ),
}));

const BLUE_HOLE = { latitude: 28.5717, longitude: 34.5372 };

const RESULT: GeocodeResult = {
  // Deliberately *not* the position that was clicked: a reverse geocode answers
  // with the matched place's own coordinates, which is exactly the trap the
  // staleness check has to avoid comparing against.
  latitude: 28.5011,
  longitude: 34.5136,
  location: "Dahab, Egypt",
  display_name: "Blue Hole, Dahab, South Sinai, Egypt",
  name: "Blue Hole",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);

beforeEach(() => {
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue(RESULT);
});

// Stands in for the dialog: holds the coordinate strings the map writes into,
// which is what makes the round trip - and the staleness of the credit - real
// rather than simulated.
function Harness({
  onUseLocation = vi.fn(),
}: {
  onUseLocation?: (value: string) => void;
}) {
  const [position, setPosition] = useState({ latitude: "", longitude: "" });
  const [location, setLocation] = useState("");
  return (
    <>
      <DiveSiteMapField
        latitude={position.latitude}
        longitude={position.longitude}
        location={location}
        onPick={setPosition}
        onUseLocation={(value) => {
          setLocation(value);
          onUseLocation(value);
        }}
      />
      <button
        type="button"
        onClick={() => setLocation("Blue Hole (north entry)")}
      >
        type a location
      </button>
      <button
        type="button"
        onClick={() => setPosition({ latitude: "10", longitude: "20" })}
      >
        type something else
      </button>
      <button
        type="button"
        onClick={() =>
          setPosition({ latitude: "28.5717", longitude: "34.5372" })
        }
      >
        type it back
      </button>
    </>
  );
}

// The map is always shown; `next/dynamic` still resolves it asynchronously.
const placePin = () => screen.findByRole("button", { name: "place the pin" });

const credit = () => screen.queryByText(/OpenStreetMap contributors, ODbL/);

describe("DiveSiteMapField", () => {
  it("writes the placed position into the coordinate fields", async () => {
    const onPick = vi.fn();
    render(
      <DiveSiteMapField
        latitude=""
        longitude=""
        onPick={onPick}
        onUseLocation={vi.fn()}
      />,
    );
    (await placePin()).click();

    expect(onPick).toHaveBeenCalledWith({
      latitude: "28.5717",
      longitude: "34.5372",
    });
  });

  it("writes the reverse-geocoded place name straight into the location", async () => {
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    (await placePin()).click();

    // No confirmation step. The Location field stays an ordinary text input, so
    // a diver who wants something else types over it.
    await waitFor(() =>
      expect(onUseLocation).toHaveBeenCalledWith("Dahab, Egypt"),
    );
    expect(reverseGeocode).toHaveBeenCalledWith(28.5717, 34.5372);
  });

  it("credits the place name, which is a licence condition of the data", async () => {
    render(<Harness />);
    (await placePin()).click();

    expect(
      await screen.findByText(/OpenStreetMap contributors, ODbL/),
    ).toBeInTheDocument();
  });

  it("announces what it filled in, since nobody is looking at the field", async () => {
    render(<Harness />);
    (await placePin()).click();

    // The Location field fills itself a round trip after the pin was placed, so
    // without this a screen reader user never learns it happened.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Location set to Dahab, Egypt.",
      ),
    );
  });

  it("drops the credit once the pin has moved, and brings it back", async () => {
    render(<Harness />);
    (await placePin()).click();
    await screen.findByText(/OpenStreetMap contributors, ODbL/);

    // The credit belongs to a lookup of *that* point; once the coordinates are
    // edited by hand it is crediting something no longer on screen.
    screen.getByRole("button", { name: "type something else" }).click();
    await waitFor(() => expect(credit()).not.toBeInTheDocument());

    // Derived rather than cleared, so the original coordinates bring it back
    // without a second lookup.
    screen.getByRole("button", { name: "type it back" }).click();
    await waitFor(() => expect(credit()).toBeInTheDocument());
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it("leaves the location alone when the API answers with no result", async () => {
    // `null` is four different things over one wire: no name for the position,
    // geocoding switched off, the instance over its provider cap, or the
    // provider timing out. Only the first would justify emptying a field, and
    // none of them are distinguishable from here - so nudging a pin twice
    // inside a second must not silently wipe a location the diver typed.
    reverseGeocode.mockResolvedValue(null);
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    (await placePin()).click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
  });

  it("leaves the location alone when the lookup fails", async () => {
    // Geocoding is optional on the API, the provider can be down, and an older
    // API has no such endpoint - none of which is an error in this form.
    reverseGeocode.mockRejectedValue(new Error("no geocoder"));
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    (await placePin()).click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
    // The pin still landed - only the optional convenience was lost.
    expect(await placePin()).toBeInTheDocument();
  });

  it("never lets a lookup write after the pin has been edited by hand", async () => {
    // Typing into the coordinate fields starts no lookup, so nothing bumps the
    // request counter - but a reply still in flight would name a pin that is no
    // longer there, or clear a name the diver had just typed.
    let resolve: (value: GeocodeResult) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    (await placePin()).click();
    screen.getByRole("button", { name: "type something else" }).click();

    resolve(RESULT);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
  });

  it("never writes over a location typed while the lookup was in the air", async () => {
    // The pin has not moved, so the coordinate guard passes - but an edit made
    // after the placement is the newer intent. "Moving the pin overwrites what
    // you typed" is the accepted cost; this is not.
    let resolve: (value: GeocodeResult) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    (await placePin()).click();
    screen.getByRole("button", { name: "type a location" }).click();

    resolve(RESULT);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalledWith("Dahab, Egypt");
    expect(credit()).not.toBeInTheDocument();
  });

  it("never lets an overtaken lookup write the location", async () => {
    // Cached answers come back far faster than ones that reach the provider, so
    // the first request can land last. Now that the result is written straight
    // into the field, a late arrival would overwrite the right answer rather
    // than merely offering a stale suggestion.
    let resolveFirst: (value: GeocodeResult) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    reverseGeocode.mockResolvedValueOnce({
      ...RESULT,
      location: "Newer, Egypt",
    });

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    const pin = await placePin();
    pin.click();
    pin.click();

    await waitFor(() =>
      expect(onUseLocation).toHaveBeenCalledWith("Newer, Egypt"),
    );
    resolveFirst({ ...RESULT, location: "Staler, Egypt" });
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(2));
    expect(onUseLocation).not.toHaveBeenCalledWith("Staler, Egypt");
  });
});
