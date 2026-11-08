import { describe, expect, it } from "vitest";
import {
  finderReducer,
  openFinder,
  type FinderState,
} from "./site-finder-state";

const DAHAB = { kind: "point" as const, latitude: 28.5, longitude: 34.5 };
const VIEW = {
  center: { latitude: 27, longitude: 34 },
  bounds: { south: 26, north: 28, west: 33, east: 35 },
};

const run = (
  state: FinderState | null,
  ...actions: Parameters<typeof finderReducer>[1][]
) => actions.reduce(finderReducer, state)!;

describe("finderReducer", () => {
  it("opens once, on the camera its rule found, and asks with it", () => {
    const opened = run(null, { type: "open", opening: DAHAB });
    expect(opened.sent).toEqual({
      camera: { latitude: 28.5, longitude: 34.5 },
      view: null,
    });
    expect(opened.target?.target).toEqual(DAHAB);

    expect(run(opened, { type: "open", opening: null })).toBe(opened);
  });

  it("opens on the world with no camera to send", () => {
    const opened = openFinder(null);
    expect(opened.camera).toBeNull();
    expect(opened.target).toBeNull();
    expect(
      run(opened, { type: "search", term: "canyon" }).sent.camera,
    ).toBeNull();
  });

  it("asks nothing on a pan, and sends the panned camera with the next term", () => {
    const panned = run(openFinder(DAHAB), { type: "moved", view: VIEW });
    expect(panned.sent.camera).toEqual({ latitude: 28.5, longitude: 34.5 });
    expect(panned.moved).toBe(true);

    expect(run(panned, { type: "search", term: "canyon" }).sent).toEqual({
      camera: VIEW.center,
      view: null,
    });
  });

  it("keeps a searched area for the next term until the map moves", () => {
    const area = run(openFinder(null), { type: "area", view: VIEW });
    expect(area.sent).toEqual({ camera: VIEW.center, view: VIEW.bounds });
    expect(area.moved).toBe(false);

    expect(run(area, { type: "search", term: "a" }).sent.view).toEqual(
      VIEW.bounds,
    );
    expect(
      run(area, { type: "moved", view: VIEW }, { type: "search", term: "a" })
        .sent.view,
    ).toBeNull();
  });

  it("moves to a place, clears the term and lists what is nearest it", () => {
    const place = run(
      openFinder(null),
      { type: "search", term: "dahab" },
      {
        type: "place",
        target: {
          kind: "bounds",
          south: 28.4,
          north: 28.6,
          west: 34.4,
          east: 34.6,
        },
      },
    );
    expect(place.term).toBe("");
    expect(place.sent.camera?.latitude).toBeCloseTo(28.5);
    expect(place.sent.view).toBeNull();
    expect(place.target?.id).toBe(1);
  });

  it("moves to the diver's location without asking", () => {
    const located = run(openFinder(DAHAB), {
      type: "locate",
      point: { latitude: 1, longitude: 2 },
    });
    expect(located.sent.camera).toEqual({ latitude: 28.5, longitude: 34.5 });
    expect(located.camera).toEqual({ latitude: 1, longitude: 2 });
    expect(located.moved).toBe(true);
    expect(located.target).toEqual({
      id: 2,
      target: { kind: "point", latitude: 1, longitude: 2 },
    });
  });

  it("opens with a term already typed, and asks nothing new when its debounce lands", () => {
    const opened = run(null, { type: "open", opening: null, term: "canyon" });
    expect(opened.term).toBe("canyon");
    expect(run(opened, { type: "search", term: "canyon" })).toBe(opened);
  });
});
