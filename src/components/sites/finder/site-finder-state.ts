import type { LatLon, LatLonBounds } from "@/lib/basemap";
import { targetCenter, type FinderTarget } from "@/lib/site-finder-camera";
import type { FinderView } from "./site-finder-points";

// What the finder's list is asked with, beside the filters, and how each thing
// the diver does moves it. The camera is the one anchor: every distance is
// measured from it and every request carries it, whatever moved it - and a pan
// moves it without asking anything.

export interface FinderState {
  /** The term the list was last asked for, trimmed. */
  term: string;
  /** Where the map is, for the list; null while it sits, unmoved, on the world. */
  camera: LatLon | null;
  /** What the list was last asked with: the camera then, and a view to keep to. */
  sent: { camera: LatLon | null; view: LatLonBounds | null };
  /** Whether the diver has moved the map since the list was asked about the view. */
  moved: boolean;
  /** The move the map is asked to make, numbered so each is made once. */
  target: { id: number; target: FinderTarget } | null;
}

export type FinderAction =
  | { type: "open"; opening: FinderTarget | null; term?: string }
  | { type: "search"; term: string }
  | { type: "moved"; view: FinderView }
  | { type: "area"; view: FinderView }
  | { type: "place"; target: FinderTarget }
  | { type: "locate"; point: LatLon };

// `term` is what the box already holds: a diver may type before the finder
// knows where it opens.
export function openFinder(
  opening: FinderTarget | null,
  term = "",
): FinderState {
  const camera = opening && targetCenter(opening);
  return {
    term,
    camera,
    sent: { camera, view: null },
    moved: false,
    target: opening && { id: 1, target: opening },
  };
}

const nextTarget = (state: FinderState, target: FinderTarget) => ({
  id: (state.target?.id ?? 0) + 1,
  target,
});

export function finderReducer(
  state: FinderState | null,
  action: FinderAction,
): FinderState | null {
  if (action.type === "open") {
    return state ?? openFinder(action.opening, action.term);
  }
  if (!state) return state;
  switch (action.type) {
    // A typed term goes from where the map is now. The view searched last is
    // kept only while the map still shows it.
    case "search": {
      const view = state.moved ? null : state.sent.view;
      // Nothing new to ask: the term the finder opened with, arriving late.
      if (
        action.term === state.term &&
        state.camera === state.sent.camera &&
        view === state.sent.view
      ) {
        return state;
      }
      return {
        ...state,
        term: action.term,
        sent: { camera: state.camera, view },
      };
    }
    // Nothing is asked: the diver offered *Search this area* instead.
    case "moved":
      return { ...state, camera: action.view.center, moved: true };
    case "area":
      return {
        ...state,
        camera: action.view.center,
        sent: { camera: action.view.center, view: action.view.bounds },
        moved: false,
      };
    // A place replaces the search: the list becomes the sites nearest it.
    case "place": {
      const camera = targetCenter(action.target);
      return {
        term: "",
        camera,
        sent: { camera, view: null },
        moved: false,
        target: nextTarget(state, action.target),
      };
    }
    // The camera goes there and nothing is asked, as after a pan.
    case "locate":
      return {
        ...state,
        camera: action.point,
        moved: true,
        target: nextTarget(state, { kind: "point", ...action.point }),
      };
  }
}
