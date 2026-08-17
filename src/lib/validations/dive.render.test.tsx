import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { useForm, useFormState, type UseFormReturn } from "react-hook-form";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMixtureFieldArray } from "@/components/dives/mixture-fields";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildDiveUpdate, diveUpdateSchema, DiveUpdateInput } from "./dive";
import type { DiveUpdate } from "@/lib/api/dives";

// `buildDiveUpdate`'s `dirtyFields` argument is only as good as what
// react-hook-form puts in it, and the unit tests one file over hand the markers
// in as literals - which pins the filtering and nothing about the library. This
// file drives a real `useForm` through the four ways the edit form's values
// actually change: a typed field, a picker cleared by the diver, the file
// import's `setValue`, and the mixture field array's `replace`. The last one is
// here because it silently did not work, and does not look any different when
// it doesn't - see "the subscription is load-bearing" at the bottom.

// What the edit page seeds `useForm` with before the dive arrives.
const BLANK: DiveUpdateInput = {
  dive_number: undefined,
  duration: "",
  trip_uuid: undefined,
  dive_site_uuids: [],
  notes: "",
  mixtures: [{ volume: 12, oxygen: 21, helium: 0 }],
};

// A dive whose trip and second site the API has hidden because both were
// deleted: `trip_uuid` arrives null, and the site list arrives one short. That
// is the shape this whole fix is about - neither is something the diver did.
const HIDDEN_REFERENCES: DiveUpdateInput = {
  dive_number: 42,
  duration: "45:30",
  trip_uuid: null,
  dive_site_uuids: ["site-1"],
  notes: "Thermocline at 18m",
  mixtures: [{ volume: 12, oxygen: 21, helium: 0 }],
};

const ON_A_TRIP: DiveUpdateInput = {
  ...HIDDEN_REFERENCES,
  trip_uuid: "trip-7",
};

// The controls, shared by the two harnesses below so the only thing that
// differs between them is where `dirtyFields` is read.
function Fields({
  form,
  mixtureFieldArray,
}: {
  form: UseFormReturn<DiveUpdateInput>;
  mixtureFieldArray: ReturnType<typeof useMixtureFieldArray>;
}) {
  return (
    <>
      <label htmlFor="notes">Notes</label>
      <input id="notes" {...form.register("notes")} />

      <button
        type="button"
        onClick={() => form.setValue("trip_uuid", null, { shouldDirty: true })}
      >
        Clear trip
      </button>

      {/* What `applyParsedDiveToForm` does to a scalar it parsed out of a
          dive-computer export. */}
      <button
        type="button"
        onClick={() =>
          form.setValue("max_depth", 31.4, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      >
        Import depth
      </button>

      {/* What `DiveSiteMultiSelect` does when a site is added: the whole
          ordered list back through the Controller, which is a registered array
          field rather than a `useFieldArray` - and therefore marked with a
          shape of its own. */}
      <button
        type="button"
        onClick={() =>
          form.setValue(
            "dive_site_uuids",
            [...(form.getValues("dive_site_uuids") ?? []), "site-2"],
            { shouldDirty: true },
          )
        }
      >
        Add a site
      </button>

      {/* And what a file import does to the cylinders, through the same
          field-array instance the form renders with. */}
      <button
        type="button"
        onClick={() =>
          mixtureFieldArray.replace([{ volume: 15, oxygen: 32, helium: 0 }])
        }
      >
        Import cylinders
      </button>

      <button type="submit">Save</button>
    </>
  );
}

// Stands in for `resetFromDive`: the form is seeded from the loaded dive
// *after* mount, and `reset` is what re-baselines dirty tracking against it.
// Seeding with `setValue` instead would mark the whole dive dirty.
function useSeededForm(loaded: DiveUpdateInput) {
  // The resolver is not decoration: `handleSubmit` hands `buildDiveUpdate`
  // zod's *parsed* output on the real page, and this function iterates the keys
  // it is given. A field present in `defaultValues` but missing from
  // `diveUpdateSchema` would be stripped before it ever reached that loop, and
  // its edit dropped - which is the exact failure class this change exists to
  // remove, so the harness has to run the same gauntlet the page does.
  const form = useForm<DiveUpdateInput>({
    defaultValues: BLANK,
    resolver: zodResolver(diveUpdateSchema),
  });
  useEffect(() => {
    form.reset(loaded);
  }, [form, loaded]);
  return form;
}

function Harness({
  loaded = HIDDEN_REFERENCES,
  onSave,
}: {
  loaded?: DiveUpdateInput;
  onSave: (update: DiveUpdate) => void;
}) {
  const form = useSeededForm(loaded);
  const mixtureFieldArray = useMixtureFieldArray(form.control);
  // Destructured here, in the render body, exactly as the edit page does it.
  // Calling the hook is not the subscription - *reading the key during render*
  // is, on this proxy as much as on `form.formState`.
  const { dirtyFields } = useFormState({ control: form.control });

  return (
    <form
      onSubmit={form.handleSubmit((data) =>
        onSave(buildDiveUpdate(data, dirtyFields)),
      )}
    >
      <Fields form={form} mixtureFieldArray={mixtureFieldArray} />
    </form>
  );
}

// The same form with no render-time read anywhere - which is what the edit page
// looked like before this fix, and what it would go back to if the
// `useFormState` line were ever tidied away as unnecessary.
function UnsubscribedHarness({
  onSave,
}: {
  onSave: (update: DiveUpdate) => void;
}) {
  const form = useSeededForm(HIDDEN_REFERENCES);
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  return (
    <form
      onSubmit={form.handleSubmit((data) =>
        onSave(buildDiveUpdate(data, form.formState.dirtyFields)),
      )}
    >
      <Fields form={form} mixtureFieldArray={mixtureFieldArray} />
    </form>
  );
}

// The form is seeded asynchronously, so every test waits for the dive to land
// before touching anything - saving too early would test the blank form.
const seeded = async () =>
  waitFor(() =>
    expect(screen.getByLabelText("Notes")).toHaveValue("Thermocline at 18m"),
  );

const save = async () => userEvent.click(screen.getByText("Save"));

describe("the edit form's PATCH body", () => {
  it("is empty when the diver saves without touching anything", async () => {
    // The bug this fix is for. Every value on the form is an echo of the dive's
    // own response, and two of them - a null trip and a site list the API
    // shortened - are read by `patch_dive` as deliberate removals.
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });

  it("carries the one field the diver edited, and nothing else", async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.clear(screen.getByLabelText("Notes"));
    await userEvent.type(screen.getByLabelText("Notes"), "Strong current");
    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ notes: "Strong current" }),
    );
  });

  it("carries a null trip the diver cleared themselves", async () => {
    // Identical on the wire to the echo the first test suppresses, and the
    // reason this can only be decided in the form: the dive is on a trip, the
    // diver clears the picker, and that null has to survive.
    const onSave = vi.fn();
    render(<Harness loaded={ON_A_TRIP} onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Clear trip"));
    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ trip_uuid: null }),
    );
  });

  it("sends nothing when clearing a trip the dive did not have", async () => {
    // The same click on a dive whose trip was already hidden. Nothing changed
    // against what the form was seeded with, so there is nothing to save -
    // react-hook-form compares against the reset baseline rather than counting
    // interactions, which is exactly the property being leaned on here.
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Clear trip"));
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });

  it("carries the whole site list when the diver adds one", async () => {
    // The other half of the data loss this branch fixes, and the field whose
    // marker shape react-hook-form decides with a heuristic - so this asserts
    // against the real library rather than a literal. The API replaces the
    // list wholesale, so the site already on the dive has to come back with
    // the new one.
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Add a site"));
    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        dive_site_uuids: ["site-1", "site-2"],
      }),
    );
  });

  it("carries what a file import wrote into it", async () => {
    // `applyParsedDiveToForm` passes `shouldDirty: true` on every scalar it
    // sets. If it ever stops, an import would be silently dropped by the filter
    // - so this asserts the pairing, not just the filter.
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Import depth"));
    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ max_depth: 31.4 }),
    );
  });

  it("carries the whole cylinder list a file import replaced", async () => {
    // `mixtures` is replaced wholesale by the API, so this has to arrive
    // complete or the cylinders left out are deleted.
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Import cylinders"));
    await save();

    await waitFor(() => {
      const update = onSave.mock.calls[0][0];
      expect(update.mixtures).toEqual([
        expect.objectContaining({ volume: 15, oxygen: 32 }),
      ]);
      // Still nothing else - the import touched the cylinders alone.
      expect(Object.keys(update)).toEqual(["mixtures"]);
    });
  });
});

// Why the page subscribes with `useFormState` instead of reading
// `form.formState.dirtyFields` inside the submit handler, which is the obvious
// way to write it and the way it was written first.
//
// `formState` is a Proxy that only begins maintaining a key once something has
// read it *during render*, and `useFieldArray`'s `replace` checks that flag
// before recomputing dirty state. Unsubscribed, `dirtyFields` is still `{}` at
// submit after an import replaced every cylinder - so the filter drops
// `mixtures` and the diver's import is discarded by a save that reports
// success. Scalars set with `shouldDirty: true` are marked either way, so the
// gap appears on exactly one path and looks like nothing at all on the others.
//
// This asserts the broken behaviour on purpose. If a future react-hook-form
// makes the unsubscribed read work, this test fails and the subscription on the
// page can go - which is the only way anyone would find out.
describe("the dirtyFields subscription is load-bearing", () => {
  it("loses a field-array edit when nothing subscribed during render", async () => {
    const onSave = vi.fn();
    render(<UnsubscribedHarness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Import cylinders"));
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });

  it("keeps it when the page's own subscription is in place", async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Import cylinders"));
    await save();

    await waitFor(() =>
      expect(onSave.mock.calls[0][0].mixtures).toHaveLength(1),
    );
  });
});
