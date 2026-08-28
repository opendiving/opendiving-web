import { describe, it, expect } from "vitest";
import {
  PPO2_DECO,
  PPO2_WORKING,
  diveModWarning,
  ead,
  endDepth,
  gasHintParts,
  ppO2Limit,
  gasName,
  mod,
  modWarning,
  ppO2AtDepth,
} from "./dive-mixtures";

describe("gasName", () => {
  it("names the three gases that have their own word", () => {
    expect(gasName(21, 0)).toBe("Air");
    expect(gasName(100, 0)).toBe("Oxygen");
    expect(gasName(32, 0)).toBe("EAN32");
  });

  it("treats the spread of fractions devices record for air as air", () => {
    // A real analyzer reads 20.9; Suunto exports 21; the API rounds parsed
    // fractions to 2 decimals, so 20.99 reaches the UI intact.
    expect(gasName(20.9, 0)).toBe("Air");
    expect(gasName(20.99, 0)).toBe("Air");
    expect(gasName(21.0, 0)).toBe("Air");
  });

  it("still names a deliberately enriched mix just above air as nitrox", () => {
    expect(gasName(22, 0)).toBe("EAN22");
  });

  it("names trimix as the O2/He pair divers write on the cylinder", () => {
    expect(gasName(21, 35)).toBe("21/35");
    expect(gasName(18, 45)).toBe("18/45");
    expect(gasName(10, 70)).toBe("10/70");
  });

  it("rounds to whole percent, since the shorthand is integer shorthand", () => {
    // The mixtures card prints the unrounded fractions in the next two columns,
    // so the label rounding never hides the real number.
    expect(gasName(32.4, 0)).toBe("EAN32");
    expect(gasName(20.99, 35.01)).toBe("21/35");
  });

  it("reads a near-100% fill as pure oxygen", () => {
    expect(gasName(99.6, 0)).toBe("Oxygen");
  });

  it("returns null when either fraction is unrecorded", () => {
    // A parsed preview reports what the file held and null for what it didn't.
    // Helium alone being unknown is enough: air and a helium mix are then
    // indistinguishable, and no honest label covers both.
    expect(gasName(null, 0)).toBeNull();
    expect(gasName(undefined, 0)).toBeNull();
    expect(gasName(32, null)).toBeNull();
    expect(gasName(null, null)).toBeNull();
  });

  it("returns null for a non-finite fraction rather than printing NaN", () => {
    // The fallback branch formats its input straight into user-facing text, so a
    // NaN has to be turned away before it gets there.
    expect(gasName(NaN, 0)).toBeNull();
    expect(gasName(21, NaN)).toBeNull();
  });

  it("refuses to give an impossible mix a plausible-looking name", () => {
    // 50/60 passes no CHECK and no refine, but does reach a parsed preview.
    expect(gasName(50, 60)).toBe("O₂ 50% / He 60%");
    expect(gasName(0, 0)).toBe("O₂ 0% / He 0%");
    expect(gasName(-5, 0)).toBe("O₂ -5% / He 0%");
  });

  it("names a mix summing to exactly 100 as normal", () => {
    expect(gasName(30, 70)).toBe("30/70");
  });
});

describe("mod", () => {
  it("computes the working limit at the default 1.4 bar", () => {
    // 1.4 / 0.32 = 4.375 bar ambient -> 3.375 bar of water -> 33.75 m
    expect(mod(32)).toBeCloseTo(33.75, 5);
  });

  it("takes the deco ceiling as an explicit parameter", () => {
    // 1.6 / 0.32 = 5 bar -> 40 m, the number on every EAN32 deco table.
    expect(mod(32, PPO2_DECO)).toBeCloseTo(40, 5);
  });

  it("puts air's working limit where recreational depth limits sit", () => {
    expect(mod(21, PPO2_WORKING)).toBeCloseTo(56.6667, 3);
  });

  it("puts pure oxygen at its familiar 6 m deco depth", () => {
    expect(mod(100, PPO2_DECO)).toBeCloseTo(6, 5);
  });

  it("returns null rather than infinity for an oxygen-free mix", () => {
    expect(mod(0)).toBeNull();
    expect(mod(-1)).toBeNull();
  });

  it("returns null for an unrecorded or half-typed fraction", () => {
    expect(mod(null)).toBeNull();
    expect(mod(undefined)).toBeNull();
    expect(mod(NaN)).toBeNull();
  });

  it("returns null for a mix already past its limit at the surface", () => {
    // Reachable only since `po2_limit` became diver-editable across [0.4, 2.0]: with
    // the 1.4/1.6 constants this needed oxygen above 140 %. EAN50 planned to 0.4
    // used to render "-2.0 m" on the mixtures card and in the form hint.
    expect(mod(50, 0.4)).toBeNull();
    expect(mod(100, 0.4)).toBeNull();
  });

  it("still answers 0 m for a mix that is exactly at its limit at the surface", () => {
    // The boundary is a real answer, not the failure above: 0.4 / 0.4 = 1 bar
    // ambient, which is the surface. Only *below* zero is meaningless.
    expect(mod(40, 0.4)).toBeCloseTo(0, 5);
  });
});

describe("ppO2AtDepth", () => {
  it("gives the surface partial pressure at zero depth", () => {
    expect(ppO2AtDepth(0, 21)).toBeCloseTo(0.21, 5);
  });

  it("scales with ambient pressure", () => {
    // 30 m = 4 bar ambient; 4 x 0.32 = 1.28
    expect(ppO2AtDepth(30, 32)).toBeCloseTo(1.28, 5);
  });

  it("agrees with mod at the depth mod returns", () => {
    const limit = mod(32, PPO2_WORKING);
    expect(limit).not.toBeNull();
    expect(ppO2AtDepth(limit as number, 32)).toBeCloseTo(PPO2_WORKING, 5);
  });

  it("returns null for an unrecorded fraction", () => {
    expect(ppO2AtDepth(30, null)).toBeNull();
  });
});

describe("endDepth", () => {
  it("counts everything that is not helium as narcotic by default", () => {
    // 21/35 at 45 m: 5.5 bar x 0.65 = 3.575 bar -> 25.75 m
    expect(endDepth(45, 35, 21)).toBeCloseTo(25.75, 5);
  });

  it("leaves a helium-free mix at its actual depth", () => {
    expect(endDepth(40, 0, 21)).toBeCloseTo(40, 5);
  });

  it("does not need the oxygen fraction in the default mode", () => {
    // Nothing but helium enters the sum when oxygen is counted narcotic, so an
    // unrecorded oxygen must not block the answer.
    expect(endDepth(45, 35, null)).toBeCloseTo(25.75, 5);
  });

  it("gives the shallower older figure when oxygen is not counted narcotic", () => {
    // 21/35 at 45 m, N2 only: 5.5 bar x 0.44 = 2.42 bar -> 14.2 m
    expect(endDepth(45, 35, 21, { o2Narcotic: false })).toBeCloseTo(14.2, 5);
  });

  it("needs the oxygen fraction when oxygen is excluded from the sum", () => {
    expect(endDepth(45, 35, null, { o2Narcotic: false })).toBeNull();
  });

  it("returns null when helium is unrecorded", () => {
    expect(endDepth(45, null, 21)).toBeNull();
  });

  it("floors at the surface rather than going negative", () => {
    // 18/45 at 4 m works out to -2.3 m: a helium mix in shallow water is less
    // narcotic than air at the surface. Reachable in the live form the moment a
    // diver has typed the "4" of a "45". Mirrors `ead`'s floor.
    expect(endDepth(4, 45, 18)).toBe(0);
    expect(endDepth(0, 70, 10)).toBe(0);
  });
});

describe("ead", () => {
  it("puts a nitrox dive shallower than it was", () => {
    // EAN32 at 30 m: 4 bar x 68/79 = 3.4430 bar -> 24.43 m
    expect(ead(30, 32)).toBeCloseTo(24.4304, 3);
  });

  it("leaves air at its actual depth", () => {
    expect(ead(30, 21)).toBeCloseTo(30, 5);
  });

  it("floors at the surface rather than going negative", () => {
    // A very rich mix in shallow water is equivalent to standing on the boat.
    expect(ead(3, 80)).toBe(0);
  });

  it("refuses a mix containing helium", () => {
    // That gas has an END, not an EAD; answering here would understate the real
    // nitrogen load.
    expect(ead(45, 21, 35)).toBeNull();
  });

  it("defaults to the helium-free case so ead(depth, o2) reads naturally", () => {
    expect(ead(30, 32)).toBe(ead(30, 32, 0));
  });

  it("returns null for an unrecorded fraction", () => {
    expect(ead(30, null)).toBeNull();
    expect(ead(30, 32, null)).toBeNull();
  });

  it("refuses a non-finite helium instead of ignoring it", () => {
    // `helium > 0` compares false for NaN, which would have computed an EAD as
    // though the cylinder held no helium at all.
    expect(ead(30, 32, NaN)).toBeNull();
  });
});

describe("modWarning", () => {
  it("stays quiet for a mix well inside its working limit", () => {
    // EAN32 works to 33.75 m.
    expect(modWarning({ oxygen: 32, helium: 0 }, 30, "metric")).toBeNull();
  });

  it("stays quiet exactly at the working limit", () => {
    expect(modWarning({ oxygen: 32, helium: 0 }, 33.75, "metric")).toBeNull();
  });

  it("flags a working-limit breach as a planning note, naming the working limit", () => {
    const warning = modWarning({ oxygen: 32, helium: 0 }, 36, "metric");
    expect(warning).toContain("33.8 m working limit");
    expect(warning).toContain(String(PPO2_WORKING));
    // The distinguishing half: still legal for a stop, which is why this is not
    // the louder sentence.
    expect(warning).toContain("decompression");
  });

  it("flags a deco-ceiling breach as the harder finding", () => {
    // EAN32's 1.6 ceiling is 40 m.
    const warning = modWarning({ oxygen: 32, helium: 0 }, 45, "metric");
    expect(warning).toContain("40.0 m limit");
    expect(warning).toContain(String(PPO2_DECO));
    expect(warning).not.toContain("decompression");
  });

  it("separates the two thresholds rather than collapsing them", () => {
    const working = modWarning({ oxygen: 32, helium: 0 }, 36, "metric");
    const deco = modWarning({ oxygen: 32, helium: 0 }, 45, "metric");
    expect(working).not.toBeNull();
    expect(deco).not.toBeNull();
    expect(working).not.toBe(deco);
  });

  it("catches a deco bottle taken to the bottom", () => {
    // EAN50 tops out at 22 m even on the 1.6 ceiling.
    expect(modWarning({ oxygen: 50, helium: 0 }, 40, "metric")).toContain(
      "22.0 m limit",
    );
  });

  it("says nothing when the dive records no maximum depth", () => {
    // Nothing to judge against, and inventing a depth would be worse than silence.
    expect(modWarning({ oxygen: 100, helium: 0 }, null, "metric")).toBeNull();
    expect(
      modWarning({ oxygen: 100, helium: 0 }, undefined, "metric"),
    ).toBeNull();
  });

  it("says nothing when the oxygen fraction is unusable", () => {
    expect(modWarning({ oxygen: null, helium: 0 }, 40, "metric")).toBeNull();
    expect(modWarning({ oxygen: 0, helium: 0 }, 40, "metric")).toBeNull();
  });

  it("leaves a normal trimix bottom gas alone at depth", () => {
    // 18/45 works to 67.8 m - the whole point of the mix.
    expect(modWarning({ oxygen: 18, helium: 45 }, 60, "metric")).toBeNull();
  });
});

describe("gasHintParts", () => {
  it("always leads with the gas name and its MOD", () => {
    expect(
      gasHintParts({ oxygen: 32, helium: 0, depth: null, units: "metric" }),
    ).toEqual(["EAN32", "MOD 33.8 m @ ppO₂ 1.4"]);
  });

  it("adds EAD for nitrox once a depth is known", () => {
    expect(
      gasHintParts({ oxygen: 32, helium: 0, depth: 30, units: "metric" }),
    ).toEqual(["EAN32", "MOD 33.8 m @ ppO₂ 1.4", "EAD 24.4 m at 30 m"]);
  });

  it("adds END rather than EAD for a helium mix", () => {
    const parts = gasHintParts({
      oxygen: 21,
      helium: 35,
      depth: 45,
      units: "metric",
    });
    expect(parts).toContain("END 25.8 m at 45 m (O₂ narcotic)");
    expect(parts.some((part) => part.startsWith("EAD"))).toBe(false);
  });

  it("gives air neither, since both would just restate the depth", () => {
    expect(
      gasHintParts({ oxygen: 21, helium: 0, depth: 30, units: "metric" }),
    ).toEqual(["Air", "MOD 56.7 m @ ppO₂ 1.4"]);
  });

  it("treats the whole air band as air, not just exactly 21", () => {
    // Guards the rule against `gasName`'s label: this used to be a `!== "Air"`
    // string comparison, which would have broken silently if that label changed.
    expect(
      gasHintParts({ oxygen: 20.99, helium: 0, depth: 30, units: "metric" }),
    ).toHaveLength(2);
    expect(
      gasHintParts({ oxygen: 20.9, helium: 0, depth: 30, units: "metric" }),
    ).toHaveLength(2);
  });

  it("drops the depth-dependent figures when the depth is unknown", () => {
    // What a multi-cylinder dive passes: which gas saw which depth is unknowable.
    expect(
      gasHintParts({ oxygen: 54, helium: 0, depth: null, units: "metric" }),
    ).toEqual(["EAN54", "MOD 15.9 m @ ppO₂ 1.4"]);
  });

  it("returns nothing at all while the gas is unidentifiable", () => {
    expect(
      gasHintParts({
        oxygen: undefined,
        helium: 0,
        depth: 30,
        units: "metric",
      }),
    ).toEqual([]);
    expect(
      gasHintParts({ oxygen: 32, helium: null, depth: 30, units: "metric" }),
    ).toEqual([]);
  });

  it("never lets an END run negative in shallow water", () => {
    // The floor belongs to `endDepth`, but this is the path that renders it.
    const parts = gasHintParts({
      oxygen: 18,
      helium: 45,
      depth: 4,
      units: "metric",
    });
    expect(parts).toContain("END 0.0 m at 4 m (O₂ narcotic)");
    expect(parts.some((part) => part.includes("-"))).toBe(false);
  });

  it("qualifies END with the narcosis convention it used", () => {
    // `o2Narcotic` defaults true; the older N2-only convention gives 14.2 m for
    // this gas, so the figure has to say which one it is.
    expect(
      gasHintParts({ oxygen: 21, helium: 35, depth: 45, units: "metric" }),
    ).toContain("END 25.8 m at 45 m (O₂ narcotic)");
  });

  it("names an impossible mix but claims nothing else about it", () => {
    // Not even a MOD: every figure below the name would be derived from fractions
    // that cannot coexist in one cylinder.
    expect(
      gasHintParts({ oxygen: 50, helium: 60, depth: 30, units: "metric" }),
    ).toEqual(["O₂ 50% / He 60%"]);
  });
});

describe("diveModWarning", () => {
  const AIR = { oxygen: 21, helium: 0 };
  const EAN32 = { oxygen: 32, helium: 0 };
  const EAN54 = { oxygen: 54, helium: 0 };

  it("judges a single cylinder against the dive's max depth", () => {
    // One tank was breathed throughout, so max depth is a depth this gas saw.
    expect(diveModWarning([EAN32], 45, "metric")).toContain("40.0 m limit");
  });

  it("keeps the working-limit note for a single cylinder", () => {
    expect(diveModWarning([EAN32], 36, "metric")).toContain("working limit");
  });

  it("stays silent on a single cylinder well within its limit", () => {
    expect(diveModWarning([EAN32], 30, "metric")).toBeNull();
  });

  it("does not blame a staged deco bottle for the dive's max depth", () => {
    // The bug this function exists to fix: air + EAN54 to 45.91 m is a normal
    // planned deco dive. EAN54 tops out at 19.6 m and was breathed on the
    // ascent, never at the bottom - warning about it fires on every correctly
    // planned technical dive.
    expect(diveModWarning([AIR, EAN54], 45.91, "metric")).toBeNull();
  });

  it("still catches a dive no gas on board could have been breathed at", () => {
    // Air is the deepest-capable of the two and tops out at 66.2 m; nothing here
    // reaches 80 m, whichever order they were breathed in.
    const warning = diveModWarning([AIR, EAN54], 80, "metric");
    expect(warning).toContain("No gas logged for this dive");
    expect(warning).toContain("66.2 m");
  });

  it("names the deepest-capable gas, not the first or the worst", () => {
    const warning = diveModWarning([EAN54, EAN32, AIR], 80, "metric");
    // Air's 66.2 m, not EAN54's 19.6 m or EAN32's 40.0 m.
    expect(warning).toContain("66.2 m");
  });

  it("judges a flagged parallel pair holding one gas as that gas", () => {
    // A sidemount pair breathed alternately at the same depth is one gas plan,
    // not a switch plan: there is one mix on board and it was breathed
    // throughout, so the dive's max depth is a depth it genuinely saw. Without
    // this the pair falls to the multi-cylinder rule, which only reports a depth
    // *no* gas could reach and would clear a real over-MOD dive.
    const pair = [
      { ...EAN32, usage: "parallel" as const },
      { ...EAN32, usage: "parallel" as const },
    ];

    expect(diveModWarning(pair, 45, "metric")).toContain("40.0 m limit");
  });

  it("keeps the working-limit note for a flagged parallel pair too", () => {
    // The half the multi-cylinder rule deliberately drops, and it is right to
    // keep here: with one gas on board, exceeding 1.4 is not the normal intended
    // state of affairs it is on a dive carrying a deco bottle.
    const pair = [
      { ...EAN32, usage: "parallel" as const },
      { ...EAN32, usage: "parallel" as const },
    ];

    expect(diveModWarning(pair, 36, "metric")).toContain("working limit");
  });

  it("needs the flag as well as the shared gas", () => {
    // Two identical cylinders with no flag are not known to have been breathed
    // together - a spare of the same mix, carried and switched to, is the same
    // two rows. The diver's answer is what makes the single-mix reading sound.
    //
    // The dive-wide sentence, not the single-mix one, and the difference is
    // visible: the flagged pair above names EAN32's own 40.0 m *limit*, while
    // this reports that no gas on board reaches the depth. Same number, two
    // different claims.
    const warning = diveModWarning([EAN32, EAN32], 45, "metric");
    expect(warning).toContain("No gas logged for this dive");
    expect(warning).not.toContain("working limit");
  });

  it("reads an absent helium as zero when comparing a flagged pair's gas", () => {
    // `OxygenFractions` allows `helium` absent, while the form and every parser
    // write a flat 0 - so a pair mixing the two spellings is the same gas and has
    // to be judged as one, not dropped to the dive-wide rule on a `undefined`
    // versus `0` comparison.
    const pair = [
      { oxygen: 32, usage: "parallel" as const },
      { oxygen: 32, helium: 0, usage: "parallel" as const },
    ];

    expect(diveModWarning(pair, 45, "metric")).toContain("40.0 m limit");
  });

  it("needs the shared gas as well as the flag", () => {
    // A flagged pair holding *different* gases is a switch plan again, and the
    // multi-cylinder rule is what applies: EAN54 tops out at 19.6 m and was not
    // necessarily what saw 45 m.
    const mixed = [
      { ...AIR, usage: "parallel" as const },
      { ...EAN54, usage: "parallel" as const },
    ];

    expect(diveModWarning(mixed, 45.91, "metric")).toBeNull();
  });

  it("treats a half-flagged pair as the multi-cylinder set it is", () => {
    // One row Parallel, one still unset says nothing about how they were
    // breathed together, so nothing stronger than the dive-wide rule is honest.
    const half = [{ ...EAN32, usage: "parallel" as const }, EAN32];

    expect(diveModWarning(half, 45, "metric")).toContain(
      "No gas logged for this dive",
    );
  });

  it("does not apply the 1.4 working limit across several cylinders", () => {
    // 45.91 m is past air's 56.7 m working limit? No - but EAN32's is 33.8 m,
    // and a multi-cylinder dive must not report that as a problem.
    expect(diveModWarning([AIR, EAN32], 45, "metric")).toBeNull();
  });

  it("says nothing without a max depth to judge against", () => {
    expect(diveModWarning([EAN54], null, "metric")).toBeNull();
    expect(diveModWarning([AIR, EAN54], undefined, "metric")).toBeNull();
  });

  it("says nothing for a dive logging no cylinders", () => {
    expect(diveModWarning([], 40, "metric")).toBeNull();
    // Pinned at a depth that *would* warn against air, which is what the create form
    // used to seed: 60 m is past air's 56.7 m working limit, so a dive whose gas card
    // the diver never opened raised a warning about a cylinder the page invented.
    // Both forms can now hold zero cylinders, so this guard is reachable rather than
    // theoretical.
    expect(diveModWarning([], 60, "metric")).toBeNull();
    expect(diveModWarning([AIR], 60, "metric")).toContain("working limit");
  });

  it("says nothing when no cylinder has a usable oxygen fraction", () => {
    expect(
      diveModWarning([{ oxygen: null }, { oxygen: 0 }], 40, "metric"),
    ).toBeNull();
  });

  it("ignores an unusable cylinder when judging the rest", () => {
    // A half-typed row must not drag the deepest-capable figure around.
    expect(diveModWarning([AIR, { oxygen: null }], 80, "metric")).toContain(
      "66.2 m",
    );
  });
});

describe("ppO2Limit", () => {
  it("uses what the dive recorded", () => {
    expect(ppO2Limit({ po2_limit: 1.6 })).toBe(1.6);
  });

  it("falls back to the working limit when nothing was recorded", () => {
    expect(ppO2Limit({})).toBe(PPO2_WORKING);
    expect(ppO2Limit({ po2_limit: null })).toBe(PPO2_WORKING);
  });

  it("falls back rather than propagating a non-number", () => {
    // A MOD of NaN would render, and a MOD computed from NaN would render as an
    // empty cell that reads like "this gas has no limit".
    expect(ppO2Limit({ po2_limit: NaN })).toBe(PPO2_WORKING);
  });
});

describe("gasHintParts in imperial", () => {
  // Every depth in the hint converts; the ppO₂ beside it does not, because ppO₂ is
  // bar on every dive computer ever made whichever units it is set to.
  it("writes the MOD in feet and leaves the ppO₂ in bar", () => {
    expect(
      gasHintParts({ oxygen: 21, helium: 0, depth: null, units: "imperial" }),
    ).toEqual(["Air", "MOD 186 ft @ ppO₂ 1.4"]);
  });

  it("writes both depths of an EAD in feet", () => {
    expect(
      gasHintParts({ oxygen: 32, helium: 0, depth: 30, units: "imperial" }),
    ).toEqual(["EAN32", "MOD 111 ft @ ppO₂ 1.4", "EAD 80 ft at 98 ft"]);
  });
});

describe("the warnings in imperial", () => {
  it("names both depths in feet", () => {
    const warning = modWarning({ oxygen: 32, helium: 0 }, 45, "imperial");

    expect(warning).toContain("148 ft is past this mix's 131 ft limit");
    expect(warning).toContain("ppO₂ 1.6");
  });
});

describe("gasHintParts with a recorded ppO2 limit", () => {
  it("computes the MOD at the dive's own limit and names it", () => {
    // EAN50 at 1.6 reaches 22 m, against 18 m at the 1.4 working limit - which is
    // the whole point of staging it.
    const parts = gasHintParts({
      oxygen: 50,
      helium: 0,
      depth: null,
      ppO2: 1.6,
      units: "metric",
    });

    expect(parts).toContain("MOD 22.0 m @ ppO₂ 1.6");
  });

  it("names the fallback it used when the dive recorded none", () => {
    // The label always describes the number beside it, so an absent limit still
    // says which one the MOD came from rather than leaving it unqualified.
    const parts = gasHintParts({
      oxygen: 50,
      helium: 0,
      depth: null,
      units: "metric",
    });

    expect(parts).toContain(`MOD 18.0 m @ ppO₂ ${PPO2_WORKING}`);
  });
});

describe("a recorded ppO2 limit does not move the warning thresholds", () => {
  it("still warns about a gas the dive recorded a high limit for", () => {
    // The MOD column would show 30 m for this gas at ppO₂ 2.0, and 32 m is inside
    // it. The warning is about what the gas can physiologically take, not about
    // what the dive planned - see `diveModWarning`. A file must not be able to
    // silence it.
    const warning = diveModWarning(
      [{ oxygen: 50, po2_limit: 2.0 }],
      32,
      "metric",
    );

    expect(warning).not.toBeNull();
    expect(warning).toContain("22.0 m");
  });
});
