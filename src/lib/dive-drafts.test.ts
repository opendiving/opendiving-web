import { describe, expect, it } from "vitest";
import {
  buildDiveDraftValues,
  draftToFormValues,
  draftVesselUuids,
} from "./dive-drafts";
import type { DiveDraftValuesRead } from "@/lib/api/dive-drafts";
import {
  emptyDiveFormValues,
  type DiveCreateInput,
} from "@/lib/validations/dive";

const form = (overrides: Partial<DiveCreateInput> = {}): DiveCreateInput => ({
  ...emptyDiveFormValues(),
  dive_number: undefined as unknown as number,
  start_time: "",
  ...overrides,
});

const NOTHING_READ: DiveDraftValuesRead = {
  dive_number: null,
  start_time: null,
  submerged_time: null,
  max_depth: null,
  avg_depth: null,
  bottom_temperature: null,
  visibility: null,
  weight: null,
  water_type: null,
  altitude: null,
  type: null,
  rating: null,
  air_temperature: null,
  current: null,
  waves: null,
  weather: null,
  entry_type: null,
  boat_name: null,
  notes: null,
  trip_uuid: null,
  course_uuid: null,
  contact_uuid: null,
  mixtures: null,
  dive_site_uuids: null,
  gear_item_uuids: null,
  sightings: null,
  people: null,
  tags: null,
};

describe("buildDiveDraftValues", () => {
  it("sends nothing for an empty form", () => {
    expect(buildDiveDraftValues(form())).toEqual({});
  });

  // Nothing required is present, and the figures are out of any dive's range -
  // a draft is saved as typed and validated when it is logged.
  it("keeps a half-filled form's values, valid or not", () => {
    expect(
      buildDiveDraftValues(
        form({
          max_depth: 18,
          avg_depth: 25,
          rating: 9,
          water_type: "salt",
          boat_name: "  Blue Moon ",
          notes: "drift",
          dive_site_uuids: ["site-1"],
          tags: ["night"],
          mixtures: [
            {
              volume: 12,
              start_pressure: 400,
              end_pressure: "",
              oxygen: "",
              helium: "",
              po2_limit: "",
              role: "",
              usage: "",
              gear_item_uuid: "",
            },
          ],
        }),
      ),
    ).toEqual({
      max_depth: 18,
      avg_depth: 25,
      rating: 9,
      water_type: "salt",
      boat_name: "Blue Moon",
      notes: "drift",
      dive_site_uuids: ["site-1"],
      tags: ["night"],
      mixtures: [{ volume: 12, start_pressure: 400, gear_item_uuid: null }],
    });
  });

  it("leaves out what the API would refuse", () => {
    expect(
      buildDiveDraftValues(
        form({
          // No offset, and a dive time it cannot read.
          start_time: "2026-07-01 09:30:00",
          submerged_time: "4x",
          // Fractions in whole-number boxes.
          dive_number: 1.5,
          visibility: 7.5,
          sightings: [
            { species_uuid: "", notes: "" },
            { species_uuid: "species-1", count: 2, notes: "" },
          ],
          people: [
            { person_uuid: "", role: "buddy" },
            { person_uuid: "person-1", role: null },
          ],
        }),
      ),
    ).toEqual({
      sightings: [{ species_uuid: "species-1", count: 2, notes: "" }],
      people: [{ person_uuid: "person-1", role: null }],
    });
  });

  it("sends a start time with an offset and a dive time in seconds", () => {
    expect(
      buildDiveDraftValues(
        form({
          dive_number: 42,
          start_time: "2026-07-01T09:30:00+02:00",
          submerged_time: "45:30",
        }),
      ),
    ).toEqual({
      dive_number: 42,
      start_time: "2026-07-01T09:30:00+02:00",
      submerged_time: 2730,
    });
  });
});

describe("draftToFormValues", () => {
  it("seeds an empty form from an empty draft, start time included", () => {
    expect(draftToFormValues(NOTHING_READ)).toEqual({
      ...emptyDiveFormValues(),
      dive_number: undefined,
      start_time: "",
      rating: null,
      contact_uuid: null,
    });
  });

  it("fills every field the draft holds", () => {
    const values = draftToFormValues(
      {
        ...NOTHING_READ,
        dive_number: 7,
        start_time: "2026-07-01T09:30:00+02:00",
        submerged_time: 2730,
        max_depth: 18,
        water_type: "salt",
        weather: "sunny",
        boat_name: "Blue Moon",
        notes: "drift",
        trip_uuid: "trip-1",
        contact_uuid: "contact-1",
        dive_site_uuids: ["site-1"],
        gear_item_uuids: ["gear-1"],
        people: [{ person_uuid: "person-1", role: "buddy" }],
        tags: ["night"],
        sightings: [
          {
            species_uuid: "species-1",
            count: null,
            abundance: "few",
            notes: "",
          },
        ],
        mixtures: [
          {
            volume: null,
            start_pressure: 200,
            end_pressure: null,
            oxygen: 32,
            helium: null,
            po2_limit: null,
            gas_number: null,
            role: "bottom",
            usage: null,
            gear_item_uuid: "tank-1",
          },
        ],
      },
      [
        {
          uuid: "tank-1",
          name: "My 12",
          volume: 12,
          rented: false,
          is_archived: false,
        },
      ],
    );

    expect(values).toMatchObject({
      dive_number: 7,
      start_time: "2026-07-01T09:30:00+02:00",
      submerged_time: "45:30",
      max_depth: 18,
      water_type: "salt",
      weather: "sunny",
      boat_name: "Blue Moon",
      notes: "drift",
      trip_uuid: "trip-1",
      contact_uuid: "contact-1",
      dive_site_uuids: ["site-1"],
      gear_item_uuids: ["gear-1"],
      people: [{ person_uuid: "person-1", role: "buddy" }],
      tags: ["night"],
      sightings: [{ species_uuid: "species-1", abundance: "few", notes: "" }],
      mixtures: [
        {
          volume: "",
          start_pressure: 200,
          end_pressure: "",
          oxygen: 32,
          role: "bottom",
          usage: "",
          gear_item_uuid: "tank-1",
          gear_item: expect.objectContaining({ uuid: "tank-1", volume: 12 }),
        },
      ],
    });
  });

  // The two directions agree: a form saved as a draft and read back is the form.
  it("reads back what buildDiveDraftValues sent", () => {
    const typed = form({
      dive_number: 3,
      start_time: "2026-07-01T09:30:00+02:00",
      submerged_time: "45:00",
      max_depth: 18,
      entry_type: "boat",
      tags: ["night"],
    });
    const sent = buildDiveDraftValues(typed);

    expect(
      draftToFormValues({
        ...NOTHING_READ,
        ...sent,
      } as unknown as DiveDraftValuesRead),
    ).toEqual(typed);
  });
});

describe("draftVesselUuids", () => {
  it("names each linked vessel once", () => {
    const tank = (gear_item_uuid: string | null) => ({
      volume: null,
      start_pressure: null,
      end_pressure: null,
      oxygen: null,
      helium: null,
      po2_limit: null,
      gas_number: null,
      role: null,
      usage: null,
      gear_item_uuid,
    });
    expect(
      draftVesselUuids({
        ...NOTHING_READ,
        mixtures: [tank("a"), tank(null), tank("a"), tank("b")],
      }),
    ).toEqual(["a", "b"]);
  });
});
