import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MixtureFields,
  useMixtureFieldArray,
} from "@/components/dives/mixture-fields";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  buildDiveUpdate,
  diveToFormValues,
  diveUpdateSchema,
  DiveUpdateInput,
} from "./dive";
import type { Dive, DiveUpdate } from "@/lib/api/dives";

// The edit form's round trip, end to end and against a real `useForm`: the dive
// goes in through `diveToFormValues`, the form is submitted, and what comes out
// of `buildDiveUpdate` has to be the dive it was seeded with. The unit tests one
// file over drive each half with literals; this is the seam between them, and
// the seam is where the bug lived - the page seeded a `DEFAULT_MIXTURE` cylinder
// for a dive that had none, which was invisible only for as long as untouched
// fields were filtered out of the PATCH.

const DIVE: Dive = {
  uuid: "dive-1",
  dive_number: 42,
  start_time: "2026-04-04T10:04:47+02:00",
  duration: 2730,
  max_depth: 31.4,
  trip_uuid: "trip-7",
  dive_sites: [
    { uuid: "site-1", name: "Pescador Island" } as Dive["dive_sites"][number],
  ],
  gear_items: [],
  notes: "Thermocline at 18m",
  user_uuid: "user-1",
  created_at: "2026-04-04T12:00:00+00:00",
  // A dive with no cylinders. Legitimate - `DiveCreate.mixtures` defaults to an
  // empty list - and the state this whole file exists for.
  mixtures: [],
};

const WITH_A_CYLINDER: Dive = {
  ...DIVE,
  mixtures: [
    {
      id: 9,
      volume: 15,
      start_pressure: 205,
      end_pressure: 90,
      oxygen: 32,
      helium: 0,
      po2_limit: 1.4,
      gas_number: 0,
      role: "bottom",
    } as Dive["mixtures"][number],
  ],
};

// Shaped like the page: `useForm` with the same resolver and the same blank
// `defaultValues`, seeded from the loaded dive by `reset` afterwards - which is
// what `useResource`'s `onLoaded` does, and what re-baselines the form against
// the dive rather than marking the whole thing changed.
//
// The resolver is not decoration. `handleSubmit` hands `buildDiveUpdate` zod's
// *parsed* output on the real page, so a field present in the seed but missing
// from `diveUpdateSchema` is stripped before it ever reaches that function - and
// with the whole form now submitted on every save, a stripped field is a field
// deleted from the dive. `gas_number` is the one nobody would notice: it has no
// input at all, and its only route back to the API is this one.
function Harness({
  dive,
  onSave,
}: {
  dive: Dive;
  onSave: (update: DiveUpdate) => void;
}) {
  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(diveUpdateSchema),
    defaultValues: {
      dive_number: undefined,
      start_time: "",
      duration: "",
      notes: "",
      mixtures: [],
    },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  useEffect(() => {
    form.reset(diveToFormValues(dive));
  }, [form, dive]);

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(buildDiveUpdate(data)))}>
      <label htmlFor="notes">Notes</label>
      <input id="notes" {...form.register("notes")} />

      {/* What a dive-file import does to the cylinders, through the same field
          array instance the form renders with. */}
      <button
        type="button"
        onClick={() =>
          mixtureFieldArray.replace([{ volume: 15, oxygen: 32, helium: 0 }])
        }
      >
        Import cylinders
      </button>

      {/* And what the per-tank Trash button does - on the last row too, since
          `MixtureFields` has no `index > 0` gate on it. */}
      <button type="button" onClick={() => mixtureFieldArray.remove(0)}>
        Remove the first tank
      </button>

      <button type="submit">Save</button>
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

describe("the edit form's round trip", () => {
  it("sends no cylinders for a dive that has none", async () => {
    // The regression sending the whole form could have introduced. The page
    // used to seed
    // `[{ ...DEFAULT_MIXTURE }]` when the dive had no mixtures, and now that
    // every field is submitted, that row would be written to the dive by a save
    // whose only edit was to the notes - an 11.1 L cylinder of air the diver
    // never entered, on a dive whose gas maths then derives from it.
    const onSave = vi.fn();
    render(<Harness dive={DIVE} onSave={onSave} />);
    await seeded();

    await userEvent.type(screen.getByLabelText("Notes"), " and a thermocline");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mixtures).toEqual([]);
  });

  it("hands a dive's own cylinder back unchanged on an untouched save", async () => {
    // Including the three fields the form carries without ever asking about
    // them. A `gas_number` of 0 is a real value and the one a truthiness check
    // would silently drop.
    const onSave = vi.fn();
    render(<Harness dive={WITH_A_CYLINDER} onSave={onSave} />);
    await seeded();

    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mixtures).toEqual([
      {
        volume: 15,
        start_pressure: 205,
        end_pressure: 90,
        oxygen: 32,
        helium: 0,
        po2_limit: 1.4,
        gas_number: 0,
        role: "bottom",
      },
    ]);
  });

  it("sends the dive back as it arrived when nothing was touched", async () => {
    const onSave = vi.fn();
    render(<Harness dive={DIVE} onSave={onSave} />);
    await seeded();

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        dive_number: 42,
        start_time: "2026-04-04T10:04:47+02:00",
        duration: 2730,
        max_depth: 31.4,
        trip_uuid: "trip-7",
        dive_site_uuids: ["site-1"],
        gear_item_uuids: [],
        notes: "Thermocline at 18m",
        mixtures: [],
        // An unrecorded water type goes out as the null it arrived as: the seed
        // holds the select's `""` and `buildDiveUpdate` converts it back. A
        // no-op against a dive that already has none, and the same echo every
        // other untouched field makes.
        water_type: null,
      }),
    );
  });

  it("hands a recorded water type and altitude back unchanged", async () => {
    // The half a `""` sentinel could quietly break: the seed converts `null` to
    // `""` for the picker, so a recorded value has to survive the same trip
    // without being flattened into "not recorded".
    const onSave = vi.fn();
    render(
      <Harness
        dive={{ ...DIVE, water_type: "brackish", altitude: 372 }}
        onSave={onSave}
      />,
    );
    await seeded();

    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      water_type: "brackish",
      altitude: 372,
    });
  });

  it("carries the whole cylinder list a file import replaced", async () => {
    // `mixtures` is replaced wholesale by the API, so this has to arrive
    // complete or the cylinders left out are deleted.
    const onSave = vi.fn();
    render(<Harness dive={WITH_A_CYLINDER} onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Import cylinders"));
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mixtures).toEqual([
      { volume: 15, oxygen: 32, helium: 0 },
    ]);
  });

  it("sends an empty list when the diver removes the only cylinder", async () => {
    // `DiveUpdate.mixtures` has always supported this, and until the Trash
    // button lost its `index > 0` gate no form could express it. That gate went
    // with "The create form proposes no cylinder, and the last one is
    // removable"; what this pins is the other half - that an empty field array
    // reaches the API as `[]` rather than being dropped from the body.
    const onSave = vi.fn();
    render(<Harness dive={WITH_A_CYLINDER} onSave={onSave} />);
    await seeded();

    await userEvent.click(screen.getByText("Remove the first tank"));
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mixtures).toEqual([]);
  });
});

// A second harness, deliberately not the one above: this one renders the real
// `MixtureFields`, which is what a rejected pressure needs in order to reach a
// `<FormMessage />`. The round-trip harness stays input-free on purpose - with
// every cylinder input mounted, a `replace()` of a partial row leaves the
// unmounted fields' old values behind, which is the page's real behaviour but
// not what those tests are pinning.
function CylinderForm({ onSave }: { onSave: (update: DiveUpdate) => void }) {
  const form = useForm<DiveUpdateInput>({
    resolver: zodResolver(diveUpdateSchema),
    defaultValues: { notes: "", mixtures: [] },
  });
  const mixtureFieldArray = useMixtureFieldArray(form.control);

  useEffect(() => {
    form.reset(diveToFormValues(WITH_A_CYLINDER));
  }, [form]);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((data) => onSave(buildDiveUpdate(data)))}
      >
        <MixtureFields control={form.control} fieldArray={mixtureFieldArray} />
        <button type="submit">Save</button>
      </form>
    </FormProvider>
  );
}

describe("a start pressure the API would refuse", () => {
  it("says what to type instead, and saves nothing", async () => {
    // The symptom this whole change was filed under - a dive that cannot be
    // saved - is now only reachable by typing a 0, since no stored mixture can
    // hold one. So the typed path is what there is to test, and the message is
    // the deliverable: the old "Start pressure must be positive" was accurate
    // and told the diver nothing about the blank box that means "unknown".
    const onSave = vi.fn();
    render(<CylinderForm onSave={onSave} />);

    const start = await screen.findByLabelText("Start pressure (bar)");
    await waitFor(() => expect(start).toHaveValue(205));

    await userEvent.clear(start);
    await userEvent.type(start, "0");
    await userEvent.click(screen.getByText("Save"));

    expect(
      await screen.findByText(
        "A cylinder can't start a dive empty — enter the fill pressure, or leave this blank if it wasn't recorded.",
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps saving a cylinder whose end pressure is 0", async () => {
    // The asymmetry, through the form rather than through `safeParse`: an
    // out-of-gas ascent is a real dive, and the diver has to be able to log it.
    const onSave = vi.fn();
    render(<CylinderForm onSave={onSave} />);

    const end = await screen.findByLabelText("End pressure (bar)");
    await waitFor(() => expect(end).toHaveValue(90));

    await userEvent.clear(end);
    await userEvent.type(end, "0");
    await userEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mixtures[0].end_pressure).toBe(0);
  });
});
