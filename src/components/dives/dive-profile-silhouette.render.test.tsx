import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DiveProfileSilhouette } from "./dive-profile-silhouette";

// The curve starts and ends at the surface, its deepest slice touches the
// foot of the box, and a series that never went under draws nothing.

const pathsOf = (depths: number[]) => {
  const { container } = render(<DiveProfileSilhouette depths={depths} />);
  return Array.from(container.querySelectorAll("path"), (path) =>
    path.getAttribute("d"),
  );
};

describe("DiveProfileSilhouette", () => {
  it("runs from the surface to the surface through the middle of each slice", () => {
    const [, line] = pathsOf([200, 400, 300, 100]);

    expect(line).toMatch(/^M0,0 /);
    for (const point of ["12.5,50", "37.5,100", "62.5,75", "87.5,25"]) {
      expect(line).toContain(point);
    }
    expect(line).toMatch(/ 100,0$/);
  });

  it("fills from the curve down to the foot of the box", () => {
    const [fill, line] = pathsOf([200, 400]);

    expect(fill).toBe(`${line} L100,100 L0,100 Z`);
  });

  it("draws nothing for a dive that never left the surface", () => {
    expect(pathsOf([0, 0, 0])).toEqual([]);
    expect(pathsOf([])).toEqual([]);
  });
});
