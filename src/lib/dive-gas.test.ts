import { describe, expect, it } from "vitest";
import type {
  Dive,
  DiveGasUse,
  DiveMixture,
  DiveTankGasUse,
} from "@/lib/api/dives";
import {
  bandRanges,
  gasAttributionNote,
  gasUseUnavailableReason,
  rollingMean,
  rollingStdDev,
  scopeRange,
  segmentByGap,
  summarizeGasUse,
  tankGasUseRows,
  trendWindow,
} from "@/lib/dive-gas";
// `periodRange`/`periodLabel`/`stepPeriod`/`availablePeriods` moved to
// `chart-period.ts` with their tests; `periodRange` stays imported here because
// `scopeRange` and `bandRanges` are specified against it.
import { type ChartScope, periodRange } from "@/lib/chart-period";

function mixture(overrides: Partial<DiveMixture> = {}): DiveMixture {
  return {
    id: 1,
    volume: 12,
    start_pressure: 200,
    end_pressure: 50,
    oxygen: 21,
    helium: 0,
    ...overrides,
  };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 1,
    start_time: "2026-04-04T10:04:47+02:00",
    duration: 2700,
    avg_depth: 18,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-04-04T08:04:47Z",
    mixtures: [mixture()],
    ...overrides,
  };
}

// Enough of a `DiveProfileInfo` to say "this dive was imported and a profile came
// out of it", which is the only thing `gasUseUnavailableReason` asks of it. Without
// one there is no `gas_attribution` column for the multi-tank derivation to read, so
// every fixture below that is *about* a later branch has to carry it.
function profile(): NonNullable<Dive["profile"]> {
  return {
    uuid: "p1",
    duration: 4300,
    depth_sample_count: 431,
    channels: ["depth"],
  };
}

function tank(overrides: Partial<DiveTankGasUse> = {}): DiveTankGasUse {
  return {
    gas_number: 1,
    gas_used: 1800,
    rmv: 18.2,
    sac_bar_per_min: 1.5,
    seconds_on_gas: 1800,
    mean_depth: 32.4,
    ...overrides,
  };
}

function multiTankUse(
  tanks: DiveTankGasUse[],
  overrides: Partial<DiveGasUse> = {},
): DiveGasUse {
  return {
    gas_used: tanks.reduce((sum, entry) => sum + entry.gas_used, 0),
    rmv: 17.4,
    // Null on an attributed multi-tank dive - see `DiveGasUse.sac_bar_per_min`,
    // whose one exception is the additive parallel path with equal volumes, which
    // this helper does not build.
    sac_bar_per_min: null,
    tanks,
    attributed_seconds: tanks.reduce(
      (sum, entry) => sum + entry.seconds_on_gas,
      0,
    ),
    duration: tanks.reduce((sum, entry) => sum + entry.seconds_on_gas, 0),
    ...overrides,
  };
}

describe("gasUseUnavailableReason", () => {
  it("says nothing when the API already derived a figure", () => {
    const derived = dive({
      gas_use: { gas_used: 1800, rmv: 14.29, sac_bar_per_min: 1.19 },
    });

    expect(gasUseUnavailableReason(derived)).toBeNull();
  });

  it("says nothing for a dive that logs no tank at all", () => {
    // Never a candidate, so there is no absence to explain - a freedive or an
    // old entry logged before mixtures were filled in shouldn't grow a nag.
    expect(gasUseUnavailableReason(dive({ mixtures: [] }))).toBeNull();
  });

  it("says nothing for a dive from the list response", () => {
    // The list carries neither `mixtures` nor `gas_use`, so without the guard
    // every row would claim its pressures were missing.
    const listDive = dive();
    delete (listDive as Partial<Dive>).mixtures;

    expect(gasUseUnavailableReason(listDive)).toBeNull();
  });

  it("names multi-tank as a limitation, not a missing field", () => {
    // A cylinder with no pressures, which is what keeps this on the multi-tank
    // sentences. The fixture used to be a plain pair - `mixture()` defaults every
    // row to 200/50 - and that shape is now the nudge's, since it is exactly what
    // a flaggable sidemount pair looks like. The assertions below were written
    // when the no-profile branch was the only answer this function had for it;
    // they were never a specification of where the nudge sits, and the sibling
    // case is the test immediately after this one.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: [
          mixture(),
          mixture({ id: 2, start_pressure: null, end_pressure: null }),
        ],
      }),
    );

    expect(reason).toMatch(/multi-tank/i);
    // It must not ask the diver to add anything - the data is all there, and
    // what's missing is an import that says which tank was breathed when.
    expect(reason).not.toMatch(/^Add /);
    expect(reason).toMatch(/import/i);
  });

  it("nudges an unflagged pair that has every pressure toward the parallel flag", () => {
    // The other half of the split above, and the whole point of the nudge's
    // position: this dive is hand-logged with no profile, so it used to be told
    // to import a dive-computer file it never made. Everything the additive
    // branch needs is on the row already except the diver's answer.
    const reason = gasUseUnavailableReason(
      dive({ mixtures: [mixture(), mixture({ id: 2 })] }),
    );

    expect(reason).toMatch(/parallel/i);
    // It states the condition rather than instructing. A diver whose pair really
    // was staged must not be walked into a flag that divides the bottle's litres
    // by the whole dive's average depth.
    expect(reason).toMatch(/^If these cylinders were breathed alternately/);
    expect(reason).not.toMatch(/import/i);
  });

  it("still nudges a half-flagged pair rather than falling silent on it", () => {
    // One row Parallel, one still Not recorded - the likeliest path into the
    // feature, and the reason the suppressing gate keys on `staged` rather than
    // on any explicit `usage`. Silencing this drops the diver onto the
    // no-profile message, which is wrong advice about an import they never made.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: [mixture({ usage: "parallel" }), mixture({ id: 2 })],
      }),
    );

    expect(reason).toMatch(/^If these cylinders were breathed alternately/);
  });

  it("says nothing about parallel once a cylinder is explicitly staged", () => {
    // A pair plus a bottle the diver marked Staged is refused by design, and
    // someone who used the control exactly right must not be nudged on every
    // render. The `staged` flag is that set's tell.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: [
          mixture({ usage: "parallel" }),
          mixture({ id: 2, usage: "parallel" }),
          mixture({ id: 3, usage: "staged" }),
        ],
      }),
    );

    expect(reason).not.toMatch(/marking each of them Parallel/);
    expect(reason).toMatch(/doesn't have one/);
  });

  it("keeps a pressure-less pair on its existing reasons rather than nudging", () => {
    // Gate 1. A bottle with no pressures is the tell of the corpus's commonest
    // multi-gas shape - back gas plus a staged deco bottle - and nudging it would
    // re-create the tell-then-refuse-again pattern the no-profile branch was
    // placed first to stop.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: [
          mixture(),
          mixture({ id: 2, start_pressure: null, end_pressure: null }),
        ],
      }),
    );

    expect(reason).not.toMatch(/Parallel/);
  });

  it("does not nudge a pair that records no drop at all", () => {
    // The other half of gate 1: pressures on both, nothing out of either. There
    // is nothing for the flag to add up, so the existing sentence stands.
    const reason = gasUseUnavailableReason(
      dive({
        profile: profile(),
        mixtures: [
          mixture({ start_pressure: 200, end_pressure: 200 }),
          mixture({ id: 2, start_pressure: 150, end_pressure: 150 }),
        ],
      }),
    );

    expect(reason).not.toMatch(/Parallel/);
    expect(reason).toMatch(/no gas used to divide up/);
  });

  it("blames attribution on the shape the whole corpus actually has", () => {
    // One transmitter on the back gas, none on the deco bottle - every multi-gas
    // dive in the corpus. The pressures that exist are usable, so the missing
    // piece is the attribution, not anything the diver left out.
    const oneTransmitter = gasUseUnavailableReason(
      dive({
        profile: profile(),
        mixtures: [
          mixture({ gas_number: 0 }),
          mixture({
            id: 2,
            gas_number: 1,
            start_pressure: null,
            end_pressure: null,
          }),
        ],
      }),
    );

    expect(oneTransmitter).toMatch(/multi-tank/i);
    expect(oneTransmitter).not.toMatch(/^Add /);
    // It must not claim the import records no gas switches. Two of the three
    // refusals this sentence covers happen on dives that *do* record them - a
    // breathed cylinder the switches never named, and a switch timed so late the
    // per-tank RMV comes out impossible - and on those the profile chart is
    // drawing the switch markers ten lines up the same page.
    expect(oneTransmitter).not.toMatch(/records which tank/);
    expect(oneTransmitter).toMatch(/account for every cylinder/);
  });

  it("names an unbreathed pair on a multi-tank dive rather than asking for it", () => {
    // Pressures present on every cylinder and equal on all of them, so the API's
    // per-tank arithmetic drops each in turn and the dive comes back empty.
    // "Add your pressures" would be wrong twice: they are there, and adding more
    // wouldn't help.
    const reason = gasUseUnavailableReason(
      dive({
        profile: profile(),
        mixtures: [
          mixture({ start_pressure: 200, end_pressure: 200 }),
          mixture({ id: 2, start_pressure: 150, end_pressure: 150 }),
        ],
      }),
    );

    expect(reason).toMatch(/no gas used to divide up/);
    expect(reason).not.toMatch(/^Add /);
  });

  it("asks a multi-tank dive for pressures when no cylinder has a pair", () => {
    // The one multi-tank case the diver can act on. Both cylinders bare, so the
    // attribution inference has nothing to go on either way and the pressures
    // are needed whatever the profile turns out to hold.
    const reason = gasUseUnavailableReason(
      dive({
        profile: profile(),
        mixtures: [
          mixture({ start_pressure: null, end_pressure: null }),
          mixture({ id: 2, start_pressure: null, end_pressure: null }),
        ],
      }),
    );

    expect(reason).toBe(
      "Add each cylinder's start and end pressure to see your gas consumption.",
    );
    // Never the singular sentence the one-tank branch uses - "this tank's"
    // points at a row the diver is not looking at.
    expect(reason).not.toMatch(/this tank/i);
    // The multi-tank path takes depth per cylinder from the profile, so asking
    // for an average depth would send the diver to a field that changes nothing.
    expect(reason).not.toMatch(/average depth/i);
  });

  it("blames attribution when only one of several cylinders has pressures", () => {
    // Half-filled is enough to rule the pressures out as the blocker: the API
    // would have produced a partial result from the cylinder it could measure.
    const reason = gasUseUnavailableReason(
      dive({
        profile: profile(),
        mixtures: [
          mixture(),
          mixture({ id: 2, start_pressure: null, end_pressure: null }),
        ],
      }),
    );

    expect(reason).toMatch(/multi-tank/i);
  });

  it("doesn't ask a hand-logged multi-tank dive for anything", () => {
    // 18 of the 19 multi-gas dives in the corpus: logged by hand, so no source
    // file and no profile - and `gas_attribution` is a column *on* the profile.
    // Nothing the diver types can produce a figure, so the sentence must not
    // send them to a field, nor imply their import is deficient when they made
    // none. Both pressures deliberately present on one cylinder, so the
    // attribution branch would otherwise have claimed exactly that.
    const handLogged = gasUseUnavailableReason(
      dive({
        mixtures: [
          mixture(),
          mixture({ id: 2, start_pressure: null, end_pressure: null }),
        ],
      }),
    );

    expect(handLogged).toMatch(/doesn't have one/);
    expect(handLogged).not.toMatch(/^Add /);
    expect(handLogged).not.toMatch(/account for every cylinder/);
  });

  it("asks for pressures only once a profile could actually use them", () => {
    // The same bare dive with an import behind it. Now the pressures are worth
    // asking for, because there is a profile whose switches might attribute
    // them.
    expect(
      gasUseUnavailableReason(
        dive({
          profile: profile(),
          mixtures: [
            mixture({ start_pressure: null, end_pressure: null }),
            mixture({ id: 2, start_pressure: null, end_pressure: null }),
          ],
        }),
      ),
    ).toMatch(/^Add each cylinder/);
  });

  // A flagged pair, which is the shape every case in this block starts from.
  // `parallel()` names it rather than each test spelling both rows out, since
  // what each is about is the *one* thing missing from it.
  function parallelPair(
    first: Partial<DiveMixture> = {},
    second: Partial<DiveMixture> = {},
  ): DiveMixture[] {
    return [
      mixture({ usage: "parallel", ...first }),
      mixture({ id: 2, usage: "parallel", ...second }),
    ];
  }

  it("asks a flagged parallel pair for the depth and the pressures together", () => {
    // The opening state of a sidemount diver's every next dive: the new-dive form
    // carries `usage` over from the last one, so all-parallel-with-nothing-else is
    // what they see before typing anything. Two sequential asks here would make
    // the commonest state of the form a run of refusals.
    const reason = gasUseUnavailableReason(
      dive({
        avg_depth: undefined,
        mixtures: parallelPair(
          { start_pressure: null, end_pressure: null },
          { start_pressure: null, end_pressure: null },
        ),
      }),
    );

    expect(reason).toBe(
      "Add an average depth and every cylinder's start and end pressure to see your gas consumption.",
    );
  });

  it("asks a flagged parallel pair for an average depth on its own", () => {
    // The round-3 finding this block exists for. Full pressures, no depth - the
    // additive branch divides by `dive.avg_depth`, so it is genuinely the missing
    // input. Without this the dive falls to the no-profile message and is told to
    // import a dive-computer file, which would compute nothing for it.
    const reason = gasUseUnavailableReason(
      dive({ avg_depth: undefined, mixtures: parallelPair() }),
    );

    expect(reason).toBe("Add an average depth to see your gas consumption.");
    expect(reason).not.toMatch(/import/i);
  });

  it("refuses a flagged pair on one missing pressure, and says every cylinder", () => {
    // One null pressure anywhere refuses the whole set: that cylinder's litres
    // would be missing from the numerator while the whole dive stayed in the
    // denominator, reporting an RMV that is too low.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: parallelPair(
          {},
          { start_pressure: null, end_pressure: null },
        ),
      }),
    );

    expect(reason).toBe(
      "Add every cylinder's start and end pressure to see your gas consumption.",
    );

    // Half a pair is still a missing pressure, and a real form state: a start
    // typed and the end not yet. Both halves of the test are checked, so a guard
    // that only ever looked at `start_pressure` would pass the case above.
    expect(
      gasUseUnavailableReason(
        dive({ mixtures: parallelPair({}, { end_pressure: null }) }),
      ),
    ).toBe(
      "Add every cylinder's start and end pressure to see your gas consumption.",
    );
  });

  it("says a flagged pair has nothing to add up when no cylinder dropped", () => {
    // "Add up", not "divide up" - nothing is apportioned on this path. A single
    // zero-drop row is fine and sums to zero litres; only a zero *total* refuses.
    const reason = gasUseUnavailableReason(
      dive({
        mixtures: parallelPair(
          { start_pressure: 200, end_pressure: 200 },
          { start_pressure: 150, end_pressure: 150 },
        ),
      }),
    );

    expect(reason).toBe(
      "No cylinder on this dive records a drop between its start and end pressure, so there is no gas used to add up.",
    );
  });

  it("says nothing at all for a flagged pair with nothing missing", () => {
    // Unreachable through the app - a set that passes every additive guard has a
    // figure, so this function is not called for it - and pinned anyway, because
    // the tempting alternative is to let it fall through to the branches below.
    // That would hand a flagged sidemount pair "import a dive-computer file",
    // which is the one sentence this whole block exists to keep away from it.
    expect(
      gasUseUnavailableReason(dive({ mixtures: parallelPair() })),
    ).toBeNull();
  });

  it("never sends a flagged pair to the no-profile or attribution sentences", () => {
    // The whole reason this block precedes them. None of those sentences is true
    // of a derivation that reads no profile at all.
    for (const mixtures of [
      parallelPair({ start_pressure: null, end_pressure: null }),
      parallelPair(
        { start_pressure: 200, end_pressure: 200 },
        { start_pressure: 150, end_pressure: 150 },
      ),
    ]) {
      const reason = gasUseUnavailableReason(dive({ mixtures }));
      expect(reason).not.toMatch(/import/i);
      expect(reason).not.toMatch(/account for every cylinder/);
    }
  });

  it("asks for an average depth when only that is missing", () => {
    expect(gasUseUnavailableReason(dive({ avg_depth: undefined }))).toBe(
      "Add an average depth to see your gas consumption.",
    );
  });

  it("treats a zero or negative average depth as missing", () => {
    expect(gasUseUnavailableReason(dive({ avg_depth: 0 }))).toMatch(
      /average depth/,
    );
  });

  it("asks for pressures when only those are missing", () => {
    const noStart = dive({
      mixtures: [mixture({ start_pressure: undefined })],
    });
    const noEnd = dive({ mixtures: [mixture({ end_pressure: undefined })] });

    expect(gasUseUnavailableReason(noStart)).toMatch(/start and end pressure/);
    expect(gasUseUnavailableReason(noEnd)).toMatch(/start and end pressure/);
  });

  it("asks for both when both are missing", () => {
    const bare = dive({
      avg_depth: undefined,
      mixtures: [
        mixture({ start_pressure: undefined, end_pressure: undefined }),
      ],
    });

    expect(gasUseUnavailableReason(bare)).toBe(
      "Add an average depth and this tank's start and end pressure to see your gas consumption.",
    );
  });

  it("explains an unbreathed tank when the pressures are equal", () => {
    const untouched = dive({
      mixtures: [mixture({ start_pressure: 200, end_pressure: 200 })],
    });

    expect(gasUseUnavailableReason(untouched)).toMatch(/no gas used/);
  });
});

describe("tankGasUseRows", () => {
  it("is empty for a dive the API derived the single-tank way", () => {
    // No `tanks` on the wire, so there is no split to render and the card keeps
    // its three headline figures. This emptiness is the switch between the two
    // layouts, not just an absence.
    const single = dive({
      gas_use: { gas_used: 1800, rmv: 14.29, sac_bar_per_min: 1.19 },
    });

    expect(tankGasUseRows(single)).toEqual([]);
  });

  it("joins each tank to its cylinder and keeps the dive's own order", () => {
    const withTanks = dive({
      mixtures: [
        mixture({ id: 1, gas_number: 1, role: "bottom" }),
        mixture({
          id: 2,
          gas_number: 2,
          oxygen: 50,
          role: "deco",
        }),
      ],
      gas_use: multiTankUse([
        // Deliberately the reverse of the dive's order: the API is free to emit
        // tanks in whatever order it walked the profile in, and the table has to
        // read against the mixtures card above it regardless.
        tank({ gas_number: 2, gas_used: 400, rmv: 12.1, mean_depth: 6.4 }),
        tank({ gas_number: 1 }),
      ]),
    });

    const rows = tankGasUseRows(withTanks);

    expect(rows.map((row) => row.label)).toEqual(["1", "2"]);
    expect(rows.map((row) => row.gas)).toEqual(["Air", "EAN50"]);
    expect(rows.map((row) => row.role)).toEqual(["bottom", "deco"]);
    expect(rows.map((row) => row.use?.gas_number)).toEqual([1, 2]);
  });

  it("joins on gas number 0, which a Suunto Ocean really uses", () => {
    // The zero trap: a falsy gas number is a real label, and every `!number`
    // shortcut in this join would drop the whole first cylinder of an Ocean
    // export.
    const ocean = dive({
      mixtures: [mixture({ gas_number: 0 })],
      gas_use: multiTankUse([tank({ gas_number: 0 })]),
    });

    expect(tankGasUseRows(ocean)[0].use?.gas_number).toBe(0);
  });

  it("names a cylinder by its position, never by its gas number", () => {
    // The same label the mixtures card uses, so the two tables agree on what to
    // call a tank - and 1-based position, which a Suunto Ocean's 0-based
    // numbering is off by one from all the way down.
    const ocean = dive({
      mixtures: [
        mixture({ id: 1, gas_number: 0 }),
        mixture({ id: 2, gas_number: 1 }),
      ],
      gas_use: multiTankUse([tank({ gas_number: 0 }), tank({ gas_number: 1 })]),
    });

    expect(tankGasUseRows(ocean).map((row) => row.label)).toEqual(["1", "2"]);
  });

  it("attributes nothing to either of two cylinders sharing a gas number", () => {
    // The failure this join exists to prevent. A naive lookup hands the same
    // tank to both rows, showing one cylinder's litres twice under a total that
    // counted them once - a table that visibly doesn't add up.
    const ambiguous = dive({
      mixtures: [
        mixture({ id: 1, gas_number: 1 }),
        mixture({ id: 2, gas_number: 1 }),
      ],
      gas_use: multiTankUse([tank({ gas_number: 1 })]),
    });

    const rows = tankGasUseRows(ambiguous);

    expect(rows.slice(0, 2).map((row) => row.use)).toEqual([null, null]);
    // And the now-orphaned tank still appears, so its litres are visible
    // somewhere rather than only inside the total.
    expect(rows).toHaveLength(3);
    expect(rows[2].label).toBe("Gas 1");
    expect(rows[2].use?.gas_number).toBe(1);
  });

  it("attributes nothing from two tanks sharing a gas number either", () => {
    // The mirror of the case above, and the worse one: a lookup keyed by gas
    // number keeps the last writer, so the 100 L tank would match nothing, be
    // skipped by an append loop testing the number rather than the tank, and
    // vanish - while its litres stayed inside the dive-wide total.
    const ambiguous = dive({
      mixtures: [mixture({ gas_number: 1 })],
      gas_use: multiTankUse([
        tank({ gas_number: 1, gas_used: 100 }),
        tank({ gas_number: 1, gas_used: 50 }),
      ]),
    });

    const rows = tankGasUseRows(ambiguous);

    expect(rows[0].use).toBeNull();
    // Every litre the total claims is visible in a row.
    expect(rows.reduce((sum, row) => sum + (row.use?.gas_used ?? 0), 0)).toBe(
      150,
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it("puts every tank in exactly one row, whatever the join does", () => {
    // The invariant the whole function rests on, and what makes "the visible
    // rows sum to the stated total" checkable rather than asserted.
    const messy = dive({
      mixtures: [
        mixture({ id: 1, gas_number: 0 }),
        mixture({ id: 2, gas_number: 4 }),
        mixture({ id: 3, gas_number: 4 }),
        mixture({ id: 4, gas_number: null }),
      ],
      gas_use: multiTankUse([
        tank({ gas_number: 0 }),
        tank({ gas_number: 4 }),
        tank({ gas_number: 9 }),
      ]),
    });

    const rows = tankGasUseRows(messy);
    const placed = rows.map((row) => row.use).filter((use) => use !== null);

    expect(placed).toHaveLength(3);
    expect(new Set(placed).size).toBe(3);
  });

  it("leaves a cylinder with no gas number unattributed", () => {
    // A hand-added cylinder on an imported dive. Nothing to join on, and
    // guessing by position is exactly the guess the API refuses to make.
    const handAdded = dive({
      mixtures: [mixture({ gas_number: null })],
      gas_use: multiTankUse([tank({ gas_number: 1 })]),
    });

    const rows = tankGasUseRows(handAdded);

    expect(rows[0].use).toBeNull();
    expect(rows[1].label).toBe("Gas 1");
  });

  it("appends a tank matching no cylinder rather than dropping it", () => {
    // Its litres are already inside the dive-wide total, so a hidden row would
    // leave a total the visible rows don't sum to.
    const orphan = dive({
      mixtures: [mixture({ gas_number: 1 })],
      gas_use: multiTankUse([tank({ gas_number: 1 }), tank({ gas_number: 7 })]),
    });

    const rows = tankGasUseRows(orphan);

    expect(rows).toHaveLength(2);
    expect(rows[1].label).toBe("Gas 7");
    expect(rows[1].gas).toBeNull();
    expect(rows[1].use?.gas_number).toBe(7);
  });

  it("gives every row a distinct key", () => {
    // Two unnumbered cylinders match no tank at all; React still needs to tell
    // their rows apart.
    const twins = dive({
      mixtures: [
        mixture({ id: 1, gas_number: null }),
        mixture({ id: 2, gas_number: null }),
      ],
      gas_use: multiTankUse([tank({ gas_number: 1 })]),
    });

    const keys = tankGasUseRows(twins).map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("gasAttributionNote", () => {
  it("says nothing when the split covers the whole recorded dive", () => {
    expect(
      gasAttributionNote(
        multiTankUse([tank()], {
          attributed_seconds: 2700,
          duration: 2700,
        }),
      ),
    ).toBeNull();
  });

  it("says nothing when the remainder is under a minute of rounding", () => {
    expect(
      gasAttributionNote(
        multiTankUse([tank()], {
          attributed_seconds: 2655,
          duration: 2700,
        }),
      ),
    ).toBeNull();
  });

  it("names both spans once a minute or more is unassigned", () => {
    const note = gasAttributionNote(
      multiTankUse([tank()], {
        attributed_seconds: 2280,
        duration: 2520,
      }),
    );

    expect(note).toBe(
      "These figures cover 38min of the 42min the dive computer recorded - the rest couldn't be assigned to a cylinder.",
    );
  });

  it("attributes the denominator, which outruns the dive's own duration", () => {
    // Dive #493's real numbers: 2075 s attributed against a 4300 s profile span,
    // on a dive whose logged duration is 4001 s and prints as "1h 7min" at the
    // top of the same page. Unattributed, "of the 1h 12min recorded" reads as
    // contradicting that header rather than as the computer's own span.
    const note = gasAttributionNote(
      multiTankUse([tank()], {
        attributed_seconds: 2075,
        duration: 4300,
      }),
    );

    expect(note).toMatch(/35min of the 1h 12min the dive computer recorded/);
  });

  it("says nothing when the API sent no coverage figures", () => {
    // Every single-tank dive, and any older response predating the pair.
    expect(
      gasAttributionNote({ gas_used: 1800, rmv: 14.29, sac_bar_per_min: 1.19 }),
    ).toBeNull();
  });

  it("says nothing rather than claiming more of the dive than it has", () => {
    // A degenerate profile, or attribution that overlapped itself. Silence beats
    // "covers 45min of the 40min recorded".
    expect(
      gasAttributionNote(
        multiTankUse([tank()], {
          attributed_seconds: 2700,
          duration: 2400,
        }),
      ),
    ).toBeNull();
    expect(
      gasAttributionNote(
        multiTankUse([tank()], {
          attributed_seconds: 0,
          duration: 0,
        }),
      ),
    ).toBeNull();
  });
});

describe("rollingMean", () => {
  it("averages over a trailing window", () => {
    expect(rollingMean([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
  });

  it("uses a shorter window before the series is long enough", () => {
    // The line has to start at the first point - beginning it `window` points
    // in would leave a gap that reads as missing data.
    expect(rollingMean([10, 20, 30], 5)).toEqual([10, 15, 20]);
  });

  it("returns nothing for an empty series", () => {
    expect(rollingMean([], 5)).toEqual([]);
  });

  it("smooths a spike instead of following it", () => {
    const smoothed = rollingMean([12, 12, 30, 12, 12], 5);

    expect(Math.max(...smoothed)).toBeLessThan(20);
  });
});

describe("trendWindow", () => {
  // Long enough that the proportional cap never binds - see the short-log
  // cases below for where it does.
  const LONG = 300;

  it("smooths harder the more history is on screen", () => {
    expect(trendWindow("month", LONG)).toBe(5);
    expect(trendWindow("year", LONG)).toBe(10);
    expect(trendWindow("all", LONG)).toBe(20);
  });

  it("narrows the window to a third of the series once that is the tighter bound", () => {
    // 30 dives at "all" would otherwise average 20 of them into every point,
    // leaving a line that can only drift toward the overall mean.
    //
    // A third is the *upper* bound, not an invariant - the five-dive floor in the
    // next test overrides it for anything under 15 dives, where a third would be
    // one or two. The old name for this test ("never smooths over more than a
    // third") claimed otherwise, and the very next test contradicted it.
    expect(trendWindow("all", 30)).toBe(10);
    expect(trendWindow("year", 24)).toBe(8);
  });

  it("never drops below the five-dive floor", () => {
    // A third of a short log is one or two dives, which is no smoothing at
    // all - the trend would just retrace the dots.
    expect(trendWindow("all", 12)).toBe(5);
    expect(trendWindow("month", 2)).toBe(5);
    expect(trendWindow("all", 0)).toBe(5);
  });

  it("only ever widens the window as the scope widens", () => {
    // The property the whole thing rests on: switching Month -> Year -> All
    // must never make the trend twitchier than it already was.
    for (const count of [0, 2, 12, 24, 30, 60, LONG]) {
      expect(trendWindow("year", count)).toBeGreaterThanOrEqual(
        trendWindow("month", count),
      );
      expect(trendWindow("all", count)).toBeGreaterThanOrEqual(
        trendWindow("year", count),
      );
    }
  });
});

describe("rollingStdDev", () => {
  it("is zero for a window with nothing to vary", () => {
    // The first point averages over itself alone, so the band pinches to the
    // line there rather than starting at some invented width.
    expect(rollingStdDev([14], 5)).toEqual([0]);
    expect(rollingStdDev([14, 14, 14], 5)).toEqual([0, 0, 0]);
  });

  it("measures the spread of the trailing window", () => {
    // Population form: mean 15, deviations ±5, so 5 - not the 7.07 the sample
    // form would give.
    expect(rollingStdDev([10, 20], 2)).toEqual([0, 5]);
  });

  it("forgets a spike once it leaves the window", () => {
    const spread = rollingStdDev([12, 12, 30, 12, 12, 12], 3);

    expect(spread[2]).toBeGreaterThan(0);
    expect(spread[5]).toBe(0);
  });

  it("returns nothing for an empty series", () => {
    expect(rollingStdDev([], 5)).toEqual([]);
  });
});

describe("bandRanges", () => {
  it("shades alternate months of a year, starting at February", () => {
    const bands = bandRanges(
      "year",
      periodRange(Date.UTC(2026, 3, 17), "year"),
    );

    expect(bands).toHaveLength(6);
    expect(bands[0]).toEqual({
      start: Date.UTC(2026, 1, 1),
      end: Date.UTC(2026, 2, 1),
    });
    expect(bands[5].end).toBe(Date.UTC(2027, 0, 1));
  });

  it("shades alternate years across a career", () => {
    const range = { start: Date.UTC(2023, 5, 1), end: Date.UTC(2026, 2, 1) };

    expect(bandRanges("all", range)).toEqual([
      { start: Date.UTC(2024, 0, 1), end: Date.UTC(2025, 0, 1) },
      // Clamped: the series ends in March, so the 2026 band does too.
      { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 2, 1) },
    ]);
  });

  it("never runs outside the plotted range", () => {
    const range = { start: Date.UTC(2023, 5, 1), end: Date.UTC(2026, 2, 1) };

    for (const band of bandRanges("all", range)) {
      expect(band.start).toBeGreaterThanOrEqual(range.start);
      expect(band.end).toBeLessThanOrEqual(range.end);
      expect(band.end).toBeGreaterThan(band.start);
    }
  });

  it("drops a band a partial year leaves no room for", () => {
    // A career that starts in December of its second (shaded) year: the band
    // would be a sliver behind the axis, not a readable block.
    const range = { start: Date.UTC(2025, 0, 1), end: Date.UTC(2026, 0, 1) };

    expect(bandRanges("all", range)).toEqual([]);
  });

  it("does not subdivide a month", () => {
    expect(
      bandRanges("month", periodRange(Date.UTC(2026, 3, 17), "month")),
    ).toEqual([]);
  });
});

describe("summarizeGasUse", () => {
  // Two dives in April 2025 averaging 20, two in October averaging 15, one in
  // March 2026 at 12.
  const times = [
    Date.UTC(2025, 3, 10),
    Date.UTC(2025, 3, 12),
    Date.UTC(2025, 9, 5),
    Date.UTC(2025, 9, 7),
    Date.UTC(2026, 2, 1),
  ];
  const rmvs = [18, 22, 14, 16, 12];

  it("averages the whole series for the all scope", () => {
    const summary = summarizeGasUse(times, rmvs, "all", times[4]);

    expect(summary).toMatchObject({ dives: 5, average: 16.4, best: 12 });
  });

  it("has nothing to compare the all scope against", () => {
    const summary = summarizeGasUse(times, rmvs, "all", times[4]);

    expect(summary?.changePercent).toBeNull();
    expect(summary?.previousLabel).toBeNull();
  });

  it("averages only the anchored period", () => {
    const summary = summarizeGasUse(times, rmvs, "month", times[0]);

    expect(summary).toMatchObject({ dives: 2, average: 20, best: 18 });
  });

  it("reports an improvement as a negative change", () => {
    // October averaged 15 against April's 20. Lower is better, so this is a 25%
    // improvement and the sign has to say so.
    const summary = summarizeGasUse(times, rmvs, "month", times[2]);

    expect(summary?.changePercent).toBeCloseTo(-25);
    expect(summary?.previousLabel).toBe("April 2025");
  });

  it("compares against the previous period with dives, not the previous calendar one", () => {
    // March 2026's predecessor is October 2025, five empty months back - "vs
    // February" would be comparing against nothing.
    const summary = summarizeGasUse(times, rmvs, "month", times[4]);

    expect(summary?.previousLabel).toBe("October 2025");
    expect(summary?.changePercent).toBeCloseTo(-20);
  });

  it("compares years when the scope is a year", () => {
    const summary = summarizeGasUse(times, rmvs, "year", times[4]);

    expect(summary?.previousLabel).toBe("2025");
    // 12 against 2025's average of 17.5.
    expect(summary?.changePercent).toBeCloseTo(-31.43, 1);
  });

  it("has nothing to compare the earliest period against", () => {
    const summary = summarizeGasUse(times, rmvs, "month", times[0]);

    expect(summary?.changePercent).toBeNull();
    expect(summary?.previousLabel).toBeNull();
  });

  it("returns null for a period with no dives", () => {
    expect(summarizeGasUse([], [], "all", 0)).toBeNull();
    expect(
      summarizeGasUse(times, rmvs, "month", Date.UTC(2025, 6, 1)),
    ).toBeNull();
  });
});

describe("segmentByGap", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("keeps a continuous run in one segment", () => {
    const times = [0, DAY, 2 * DAY];

    expect(segmentByGap(times, 60)).toEqual([[0, 1, 2]]);
  });

  it("splits where the break exceeds the threshold", () => {
    // Two dives in April, two in October - the six months between them is not a
    // gentle decline in consumption, it's an off-season.
    const times = [0, DAY, 200 * DAY, 201 * DAY];

    expect(segmentByGap(times, 60)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("does not split on a gap exactly at the threshold", () => {
    expect(segmentByGap([0, 60 * DAY], 60)).toEqual([[0, 1]]);
    expect(segmentByGap([0, 61 * DAY], 60)).toEqual([[0], [1]]);
  });

  it("covers every index exactly once, in order", () => {
    const times = [0, 100 * DAY, 101 * DAY, 500 * DAY];

    expect(segmentByGap(times, 60).flat()).toEqual([0, 1, 2, 3]);
  });

  it("returns nothing for an empty series", () => {
    expect(segmentByGap([], 60)).toEqual([]);
  });
});

describe("scopeRange", () => {
  // Callers filter with `time >= start && time < end`, so these tests assert on
  // what actually survives that filter rather than on the bounds themselves -
  // the bug this replaced had perfectly reasonable-looking bounds.
  const visible = (times: number[], anchor: number, scope: ChartScope) => {
    const range = scopeRange(times, anchor, scope);
    return times.filter((time) => time >= range.start && time < range.end);
  };

  it("delegates to periodRange for year and month", () => {
    const anchor = Date.UTC(2026, 3, 17);
    expect(scopeRange([anchor], anchor, "year")).toEqual(
      periodRange(anchor, "year"),
    );
    expect(scopeRange([anchor], anchor, "month")).toEqual(
      periodRange(anchor, "month"),
    );
  });

  // The regression: an "all" range ending at the last dive's own timestamp
  // dropped that dive from the plot, so the chart always showed one fewer dive
  // than the card's "Dives" stat above it.
  it("includes the newest dive at the 'all' scope", () => {
    const times = [
      Date.UTC(2025, 3, 10),
      Date.UTC(2025, 8, 2),
      Date.UTC(2026, 3, 17),
    ];

    expect(visible(times, times[0], "all")).toEqual(times);
  });

  it("includes every dive tied at the newest timestamp", () => {
    const last = Date.UTC(2026, 3, 17);
    const times = [Date.UTC(2025, 3, 10), last, last];

    expect(visible(times, times[0], "all")).toEqual(times);
  });

  it("handles a single-dive series", () => {
    const only = Date.UTC(2026, 3, 17);
    expect(visible([only], only, "all")).toEqual([only]);
  });

  it("returns a degenerate, non-NaN range for an empty series", () => {
    const range = scopeRange([], 0, "all");
    expect(Number.isNaN(range.start)).toBe(false);
    expect(Number.isNaN(range.end)).toBe(false);
    expect(range.end).toBeGreaterThan(range.start);
  });
});
