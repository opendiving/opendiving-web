import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

const { geocodingAPI } = await import("@/lib/api/geocoding");
const reverseGeocode = vi.mocked(geocodingAPI.reverseGeocode);

beforeEach(() => {
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue({ status: "unknown" });
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
