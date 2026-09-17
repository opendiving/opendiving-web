import { describe, it, expect } from "vitest";

import {
  hasDivingFigures,
  loggedDivingFigures,
  missingCheckInDetails,
} from "./checkin";
import type { User } from "@/lib/api/auth";
import type { UserDiveStats } from "@/lib/api/dive-stats";

const user = (over: Partial<User> = {}): User => ({
  uuid: "user-1",
  name: "Sam Reef",
  username: "sam",
  email: "sam@example.com",
  units: "metric",
  dive_form_hidden_fields: [],
  ...over,
});

const filled: Partial<User> = {
  date_of_birth: "1988-04-02",
  phone: "+44 7700 900000",
  emergency_contact_name: "Alex Reef",
  emergency_contact_phone: "+44 7700 900111",
  insurance_provider: "DAN Europe",
  insurance_policy_number: "P-42",
};

const stats: UserDiveStats = {
  user_uuid: "user-1",
  total_dives: 142,
  max_depth: 39.6,
  total_time: 360000,
  species_seen: 12,
  created_at: "2026-01-01T00:00:00+00:00",
};

describe("missingCheckInDetails", () => {
  it("names all four for an account nobody has filled in", () => {
    expect(missingCheckInDetails(user())).toEqual([
      "date of birth",
      "phone number",
      "dive insurance",
      "emergency contact",
    ]);
  });

  it("is empty once a desk has everything it asks for", () => {
    expect(missingCheckInDetails(user(filled))).toEqual([]);
  });

  it("counts a contact nobody can call as missing", () => {
    // A name with no number is not somebody a shop can reach, so the pair is the
    // unit - the same for a policy number with no provider to quote it to.
    expect(
      missingCheckInDetails(user({ ...filled, emergency_contact_phone: null })),
    ).toEqual(["emergency contact"]);
    expect(
      missingCheckInDetails(user({ ...filled, insurance_provider: null })),
    ).toEqual(["dive insurance"]);
  });

  it("reads an empty string as unfilled, which is what a cleared field sends", () => {
    expect(missingCheckInDetails(user({ ...filled, phone: "" }))).toEqual([
      "phone number",
    ]);
  });
});

describe("loggedDivingFigures", () => {
  it("takes the last dive's own calendar day, not the reader's", () => {
    // 00:30 on the 15th in +02:00 is still the 14th in UTC and the 14th in a
    // negative-offset browser. The dive was logged on the 15th.
    expect(loggedDivingFigures(stats, "2026-08-15T00:30:00+02:00")).toEqual({
      totalDives: 142,
      maxDepth: 39.6,
      lastDiveOn: "2026-08-15",
    });
  });

  it("is all nulls when neither request landed", () => {
    expect(loggedDivingFigures(null, null)).toEqual({
      totalDives: null,
      maxDepth: null,
      lastDiveOn: null,
    });
  });

  it("keeps a zeroed stat, which is a diver with nothing logged rather than nothing known", () => {
    const empty = { ...stats, total_dives: 0, max_depth: 0 };
    expect(loggedDivingFigures(empty, null).totalDives).toBe(0);
    expect(hasDivingFigures(loggedDivingFigures(empty, null))).toBe(true);
  });
});

describe("hasDivingFigures", () => {
  it("is false only when all three are absent", () => {
    expect(
      hasDivingFigures({ totalDives: null, maxDepth: null, lastDiveOn: null }),
    ).toBe(false);
    expect(
      hasDivingFigures({
        totalDives: null,
        maxDepth: null,
        lastDiveOn: "2026-08-14",
      }),
    ).toBe(true);
  });
});
