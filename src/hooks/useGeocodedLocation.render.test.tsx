import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useGeocodedLocation } from "./useGeocodedLocation";
import {
  geocodingAPI,
  GeocodeResult,
  ReverseGeocode,
} from "@/lib/api/geocoding";
import { Attribution } from "@/components/attribution";

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { reverseGeocode: vi.fn() },
}));

const BLUE_HOLE = { latitude: "28.5717", longitude: "34.5372" };

const RESULT: GeocodeResult = {
  // Deliberately *not* the position that was placed: a reverse geocode answers
  // with the matched place's own coordinates, which is exactly the trap the
  // staleness check has to avoid comparing against.
  latitude: 28.5011,
  longitude: 34.5136,
  location: "Dahab, Egypt",
  display_name: "Blue Hole, Dahab, South Sinai, Egypt",
  name: "Blue Hole",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

const named = (result: GeocodeResult): ReverseGeocode => ({
  status: "named",
  result,
});

const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);

beforeEach(() => {
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue(named(RESULT));
});

// Stands in for `DiveSiteDialog`, down to rendering the credit and the status
// line the way `DiveSiteMapField` does: this hook's whole output is those two,
// plus whatever it writes into the Location field, and the round trip through
// the form is what makes staleness real rather than simulated.
function Harness({
  onUseLocation = vi.fn(),
  initialLocation = "",
}: {
  onUseLocation?: (value: string) => void;
  // Stands in for a location the diver typed *before* placing the position,
  // which is the only thing a nameless position has to clear.
  initialLocation?: string;
}) {
  const [open, setOpen] = useState(true);
  const [position, setPosition] = useState({ latitude: "", longitude: "" });
  const [location, setLocation] = useState(initialLocation);

  const geocoded = useGeocodedLocation({
    open,
    latitude: position.latitude,
    longitude: position.longitude,
    location,
    onUseLocation: (value) => {
      setLocation(value);
      onUseLocation(value);
    },
  });

  const place = (next: { latitude: string; longitude: string }) => {
    setPosition(next);
    geocoded.lookup(next);
  };

  return (
    <>
      <p role="status">
        {geocoded.credit && (
          <>
            Location from <Attribution value={geocoded.credit} />
          </>
        )}
        <span>{geocoded.announcement}</span>
      </p>
      <button type="button" onClick={() => place(BLUE_HOLE)}>
        place the pin
      </button>
      <button
        type="button"
        onClick={() => {
          const picked = { latitude: "28.5011", longitude: "34.5136" };
          setPosition(picked);
          geocoded.adopt(picked, RESULT);
        }}
      >
        pick a place
      </button>
      {/* A catalog dive site far enough offshore to have resolved to neither a
          region nor a country: a position and a name, and nothing to say about
          the Location field. */}
      <button
        type="button"
        onClick={() => {
          const picked = { latitude: "28.5011", longitude: "34.5136" };
          setPosition(picked);
          geocoded.adopt(picked, null);
        }}
      >
        pick a place that named nowhere
      </button>
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
      <button type="button" onClick={() => setPosition(BLUE_HOLE)}>
        type it back
      </button>
      {/* Two buttons, not one that toggles twice: React would batch the pair
          into a single render where `open` never changed, and the reset keys
          off it changing. */}
      <button type="button" onClick={() => setOpen(false)}>
        close the dialog
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        open the dialog
      </button>
    </>
  );
}

const placePin = () => screen.getByRole("button", { name: "place the pin" });

const credit = () => screen.queryByText(/OpenStreetMap contributors, ODbL/);

describe("useGeocodedLocation", () => {
  it("writes the reverse-geocoded place name straight into the location", async () => {
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();

    // No confirmation step. The Location field stays an ordinary text input, so
    // a diver who wants something else types over it.
    await waitFor(() =>
      expect(onUseLocation).toHaveBeenCalledWith("Dahab, Egypt"),
    );
    expect(reverseGeocode).toHaveBeenCalledWith(28.5717, 34.5372);
  });

  it("credits the place name, which is a licence condition of the data", async () => {
    render(<Harness />);
    placePin().click();

    expect(
      await screen.findByText(/OpenStreetMap contributors, ODbL/),
    ).toBeInTheDocument();
  });

  it("announces what it filled in, since nobody is looking at the field", async () => {
    render(<Harness />);
    placePin().click();

    // The Location field fills itself a round trip after the position was
    // placed, so without this a screen reader user never learns it happened.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Location set to Dahab, Egypt.",
      ),
    );
  });

  it("drops the credit once the position has moved, and brings it back", async () => {
    render(<Harness />);
    placePin().click();
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

  it("starts clean when the dialog is reopened", async () => {
    // This state used to unmount with the dialog's content. It lives above it
    // now, so a credit earned on the last site it showed would otherwise be
    // waiting for the next one that happened to share its coordinates.
    render(<Harness />);
    placePin().click();
    await screen.findByText(/OpenStreetMap contributors, ODbL/);

    // `fireEvent`, which flushes each click on its own, rather than two bare
    // `.click()`s that React would batch into one render where `open` never
    // changed.
    fireEvent.click(screen.getByRole("button", { name: "close the dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "open the dialog" }));
    await waitFor(() => expect(credit()).not.toBeInTheDocument());
  });

  it("leaves the location alone when the API could not ask", async () => {
    // `unknown` covers geocoding being switched off, the instance being over its
    // provider cap, and the provider timing out - three facts about us, none of
    // them a fact about the position. So nudging a pin twice inside a second
    // must not silently wipe a location the diver typed.
    reverseGeocode.mockResolvedValue({ status: "unknown" });
    const onUseLocation = vi.fn();
    render(
      <Harness
        onUseLocation={onUseLocation}
        initialLocation="Blue Hole (north entry)"
      />,
    );
    placePin().click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
  });

  it("clears the location when the position genuinely has no name", async () => {
    // The other half of the same distinction: the API asked and there is no name
    // there, so whatever is in the field describes where the pin used to be.
    reverseGeocode.mockResolvedValue({ status: "nameless" });
    const onUseLocation = vi.fn();
    render(
      <Harness
        onUseLocation={onUseLocation}
        initialLocation="Blue Hole (north entry)"
      />,
    );
    placePin().click();

    await waitFor(() => expect(onUseLocation).toHaveBeenCalledWith(""));
    // Nothing was named, so there is nothing to credit.
    expect(credit()).not.toBeInTheDocument();
  });

  it("says nothing when a nameless position has nothing to clear", async () => {
    // The commonest flow of all: a new site, Location still empty, pin dropped
    // in open water. Writing "" over "" is invisible on screen but not in the
    // status region, which would announce a clearing that cleared nothing.
    reverseGeocode.mockResolvedValue({ status: "nameless" });
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("counts a whitespace-only location as nothing to clear", async () => {
    // Same guard, and the same reason: emptying "  " looks exactly like emptying
    // "" on screen, so announcing a clearing is wrong for exactly the reader who
    // cannot check. `isSet` in `lib/validations/dive-site.ts` trims for the rest
    // of this form.
    reverseGeocode.mockResolvedValue({ status: "nameless" });
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} initialLocation="   " />);
    placePin().click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces a clearing, which is otherwise entirely silent", async () => {
    reverseGeocode.mockResolvedValue({ status: "nameless" });
    render(<Harness initialLocation="Blue Hole (north entry)" />);
    placePin().click();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This position has no name, so the location was cleared.",
      ),
    );
  });

  it("never clears a location typed while the lookup was in the air", async () => {
    // The clearing path runs the same guards as the naming one: an edit made
    // after the placement is the newer intent, and emptying it is the more
    // destructive of the two ways to get this wrong.
    let resolve: (value: ReverseGeocode) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();
    screen.getByRole("button", { name: "type a location" }).click();

    resolve({ status: "nameless" });
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
  });

  it("leaves the location alone when the lookup fails", async () => {
    // Geocoding is optional on the API, the provider can be down, and an older
    // API has no such endpoint - none of which is an error in this form.
    reverseGeocode.mockRejectedValue(new Error("no geocoder"));
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
  });

  it("never lets a lookup write after the position has been edited by hand", async () => {
    // Typing into the coordinate fields starts no lookup, so nothing bumps the
    // request counter - but a reply still in flight would name a position that
    // is no longer there, or clear a name the diver had just typed.
    let resolve: (value: ReverseGeocode) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();
    screen.getByRole("button", { name: "type something else" }).click();

    resolve(named(RESULT));
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalled();
    expect(credit()).not.toBeInTheDocument();
  });

  it("never writes over a location typed while the lookup was in the air", async () => {
    // The position has not moved, so the coordinate guard passes - but an edit
    // made after the placement is the newer intent. "Moving the pin overwrites
    // what you typed" is the accepted cost; this is not.
    let resolve: (value: ReverseGeocode) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();
    screen.getByRole("button", { name: "type a location" }).click();

    resolve(named(RESULT));
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalledWith("Dahab, Egypt");
    expect(credit()).not.toBeInTheDocument();
  });

  it("never lets an overtaken lookup write the location", async () => {
    // Cached answers come back far faster than ones that reach the provider, so
    // the first request can land last. The result is written straight into the
    // field, so a late arrival would overwrite the right answer rather than
    // merely offering a stale suggestion.
    let resolveFirst: (value: ReverseGeocode) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    reverseGeocode.mockResolvedValueOnce(
      named({ ...RESULT, location: "Newer, Egypt" }),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();
    placePin().click();

    await waitFor(() =>
      expect(onUseLocation).toHaveBeenCalledWith("Newer, Egypt"),
    );
    resolveFirst(named({ ...RESULT, location: "Staler, Egypt" }));
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(2));
    expect(onUseLocation).not.toHaveBeenCalledWith("Staler, Egypt");
  });
});

describe("useGeocodedLocation, adopting a searched place", () => {
  it("uses the name the search already came with, without a lookup", async () => {
    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    screen.getByRole("button", { name: "pick a place" }).click();

    await waitFor(() =>
      expect(onUseLocation).toHaveBeenCalledWith("Dahab, Egypt"),
    );
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(credit()).toBeInTheDocument();
  });

  it("announces the coordinates too, since nothing else says them out loud", async () => {
    // A searched place moves the pin as well as filling the field, and the map
    // only announces what it placed itself.
    render(<Harness />);
    screen.getByRole("button", { name: "pick a place" }).click();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Placed at 28.5011, 34.5136. Location set to Dahab, Egypt.",
      ),
    );
  });

  it("cancels a lookup that is still in the air", async () => {
    // The reply would be about the position the search has just replaced - and
    // its own guards would pass if the diver happened to be back where they
    // started.
    let resolve: (value: ReverseGeocode) => void = () => {};
    reverseGeocode.mockImplementationOnce(
      () => new Promise((keep) => (resolve = keep)),
    );

    const onUseLocation = vi.fn();
    render(<Harness onUseLocation={onUseLocation} />);
    placePin().click();
    screen.getByRole("button", { name: "pick a place" }).click();

    resolve(named({ ...RESULT, location: "Staler, Egypt" }));
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
    expect(onUseLocation).not.toHaveBeenCalledWith("Staler, Egypt");
    expect(onUseLocation).toHaveBeenCalledWith("Dahab, Egypt");
  });
});

// A catalog dive site can resolve to no place at all - a few dozen sit further
// than 50 km from any administrative boundary and ship anyway. That is a fact
// about the catalog, not about the position, so it is no more grounds to empty
// the Location field than an `unknown` lookup is.
describe("useGeocodedLocation, adopting a row that named nowhere", () => {
  const pickNowhere = () =>
    screen
      .getByRole("button", { name: "pick a place that named nowhere" })
      .click();

  it("leaves the location field exactly as the diver left it", async () => {
    const onUseLocation = vi.fn();
    render(
      <Harness
        onUseLocation={onUseLocation}
        initialLocation="Somewhere in the Red Sea"
      />,
    );
    pickNowhere();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Placed at"),
    );
    expect(onUseLocation).not.toHaveBeenCalled();
  });

  it("announces the placement without claiming a location was set", async () => {
    render(<Harness />);
    pickNowhere();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Placed at 28.5011, 34.5136.",
      ),
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Location set to");
  });

  it("credits nobody for a location it did not write", async () => {
    render(<Harness />);
    pickNowhere();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Placed at"),
    );
    expect(credit()).not.toBeInTheDocument();
  });
});
