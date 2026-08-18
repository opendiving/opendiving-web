import { describe, expect, it } from "vitest";
import { isDirty } from "./form-dirty";

// The markers here are literals, which pins the reading of them and nothing
// about react-hook-form. The two callers each have a `.render.test.tsx` next to
// them that drives a real `useForm` and asserts the shapes it actually produces
// - `dive.render.test.tsx` and `gear-set-dialog.render.test.tsx`.
describe("isDirty", () => {
  it("treats an absent marker as untouched", () => {
    // The common case, and the one the whole filter turns on: react-hook-form
    // omits the key entirely for a field that still matches what the form was
    // seeded with.
    expect(isDirty(undefined)).toBe(false);
  });

  it("reads a bare true as dirty", () => {
    // How a scalar is marked, and - despite the library's own types saying
    // otherwise - how a *registered* array leaf like `gear_item_uuids` is too.
    expect(isDirty(true)).toBe(true);
  });

  it("reads an all-false marker as untouched", () => {
    // Defensive, not observed. 7.84 deletes a field's key once it matches the
    // seeded value again rather than writing `false`, but older versions wrote
    // it, the meaning is unambiguous, and reading it costs nothing.
    expect(isDirty(false)).toBe(false);
    expect(isDirty({ oxygen: false })).toBe(false);
    expect(isDirty([{ oxygen: false }, {}])).toBe(false);
  });

  it("reads an array marked per index as dirty", () => {
    expect(isDirty([undefined, true])).toBe(true);
  });

  it("recurses into a field array's entries", () => {
    // Editing one cylinder's oxygen marks `mixtures[1].oxygen`, and the answer
    // for `mixtures` has to be "yes": the API replaces the list wholesale, so
    // one changed entry means sending all of them.
    expect(isDirty([{}, { oxygen: true }])).toBe(true);
  });

  it("says nothing is dirty when a field array was only visited", () => {
    // An entry the diver tabbed through is an object with no marked leaf, and
    // must not drag the whole list into the request.
    expect(isDirty([{}, {}])).toBe(false);
    expect(isDirty({})).toBe(false);
  });
});
