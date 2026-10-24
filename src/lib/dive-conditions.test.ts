import { describe, expect, it } from "vitest";
import { compassPoint, fetchedFields, fetchedMarks } from "./dive-conditions";
import { dive, diveConditions } from "@/test/dive-fixtures";

describe("compassPoint", () => {
  it.each([
    [0, "N"],
    [22, "NNE"],
    [45, "NE"],
    [180, "S"],
    [348.75, "N"],
    [348.74, "NNW"],
    [360, "N"],
    [-90, "W"],
  ])("names %s° %s", (degrees, point) => {
    expect(compassPoint(degrees)).toBe(point);
  });
});

describe("fetchedFields", () => {
  it("names the fields still holding what the fetch wrote", () => {
    expect(
      fetchedFields(
        dive({
          air_temperature: 38.1,
          weather: "overcast",
          waves: "slight",
          conditions: diveConditions(),
        }),
      ),
    ).toEqual({ air_temperature: 38.1, waves: "slight" });
  });

  it("names none without conditions", () => {
    expect(fetchedFields(dive({ weather: "clear" }))).toEqual({});
    expect(fetchedMarks(dive({ weather: "clear", conditions: null }))).toBe(
      undefined,
    );
  });

  it("carries the credit with the marks", () => {
    const marks = fetchedMarks(
      dive({ weather: "clear", conditions: diveConditions() }),
    );
    expect(marks?.values).toEqual({ weather: "clear" });
    expect(marks?.attribution).toMatch(/Open-Meteo/);
  });
});
