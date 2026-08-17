import { describe, expect, it } from "vitest";
import { formatDistance, haversineMeters } from "./geo-distance";

describe("haversineMeters", () => {
  // One degree of latitude on the equator is a known quantity - about 111.2 km -
  // so it pins the radius and the radians conversion at once. The tolerance is a
  // few metres, which is the sphere-versus-ellipsoid difference, not slack.
  it("measures a degree of latitude at the equator", () => {
    expect(
      haversineMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
      ),
    ).toBeCloseTo(111195, -1);
  });

  // The Dahab fixes this feature was built against, entry and exit a short swim
  // apart. Off by more than a few metres would mean the formula, not the data.
  it("measures a swim between two nearby fixes", () => {
    expect(
      haversineMeters(
        { latitude: 28.4375, longitude: 34.4584 },
        { latitude: 28.4392, longitude: 34.4571 },
      ),
    ).toBeCloseTo(227.8, 1);
  });

  // The whole reason for haversine rather than subtracting projected metres:
  // 179.9999°E and 179.9999°W are 22 m apart, and no wrapping code says so.
  it("crosses the antimeridian without going round the world", () => {
    expect(
      haversineMeters(
        { latitude: 0, longitude: 179.9999 },
        { latitude: 0, longitude: -179.9999 },
      ),
      // Two decimals rather than one: at one, the tolerance is 0.05 against a
      // value 0.045 off the round number, so switching `EARTH_RADIUS_M` to the
      // 6371000 figure would fail here and read as a formula bug.
    ).toBeCloseTo(22.24, 2);
  });

  it("is zero for a point against itself", () => {
    const point = { latitude: 28.4375, longitude: 34.4584 };
    expect(haversineMeters(point, point)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("shows whole metres below a kilometre", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(211.6)).toBe("212 m");
    expect(formatDistance(999.4)).toBe("999 m");
  });

  // The boundary in both directions: 999.5 m rounds to 1000 metres, which must
  // not render as "1000 m" beside a "1.0 km" one millimetre further on.
  it("switches to kilometres at a kilometre", () => {
    expect(formatDistance(999.5)).toBe("1.0 km");
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(1249)).toBe("1.2 km");
    expect(formatDistance(12345)).toBe("12.3 km");
  });
});
