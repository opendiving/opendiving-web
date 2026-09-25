import { describe, it, expect } from "vitest";
import {
  CERTIFICATION_AGENCIES,
  certificationAgencyLabel,
  certificationLabel,
} from "./certifications";

describe("certificationAgencyLabel", () => {
  it("spells out the acronym for a known agency", () => {
    expect(certificationAgencyLabel("padi")).toBe("PADI");
  });

  it("spells an agency the way the agency spells itself", () => {
    // The last widening before the format freezes: short names that are not a
    // capitalized slug, so each is written out rather than derived.
    expect(certificationAgencyLabel("scotsac")).toBe("ScotSAC");
    expect(certificationAgencyLabel("protec")).toBe("ProTec");
    expect(certificationAgencyLabel("apnea_academy")).toBe("Apnea Academy");
    expect(certificationAgencyLabel("nss_cds")).toBe("NSS-CDS");
    expect(certificationAgencyLabel("aida")).toBe("AIDA");
  });

  it("offers the format's vocabulary in its order, with `other` last", () => {
    expect(CERTIFICATION_AGENCIES.slice(-21)).toEqual([
      "ndl",
      "utd",
      "saa",
      "scotsac",
      "iac",
      "protec",
      "pdic",
      "nase",
      "sei",
      "ymca",
      "erdi",
      "aida",
      "molchanovs",
      "pfi",
      "apnea_academy",
      "fii",
      "nss_cds",
      "nacd",
      "idea",
      "diwa",
      "other",
    ]);
  });

  it("uses the diver's own wording for `other`", () => {
    expect(certificationAgencyLabel("other", "Dive Club Zürich")).toBe(
      "Dive Club Zürich",
    );
    expect(certificationAgencyLabel("other", "  ")).toBe("Other");
    expect(certificationAgencyLabel("other")).toBe("Other");
  });

  it("passes through an agency this build doesn't know", () => {
    expect(certificationAgencyLabel("nobody-has-heard-of-it")).toBe(
      "nobody-has-heard-of-it",
    );
  });

  it("returns null when there is no agency", () => {
    expect(certificationAgencyLabel(null)).toBeNull();
    expect(certificationAgencyLabel(undefined)).toBeNull();
  });
});

describe("certificationLabel", () => {
  it("prefixes the level with the agency", () => {
    expect(certificationLabel({ name: "Advanced Nitrox", agency: "tdi" })).toBe(
      "TDI Advanced Nitrox",
    );
  });

  it("distinguishes the same level held from two agencies", () => {
    // The whole reason the agency is in the name: certifications carry no
    // unique-name constraint, so a row's controls named by level alone would
    // read identically to another row's.
    const name = "Advanced Nitrox";
    expect(certificationLabel({ name, agency: "padi" })).not.toBe(
      certificationLabel({ name, agency: "tdi" }),
    );
  });

  it("uses the diver's own agency wording for `other`", () => {
    expect(
      certificationLabel({
        name: "Cave 1",
        agency: "other",
        agency_other: "CDG",
      }),
    ).toBe("CDG Cave 1");
  });

  it("falls back to the bare name when there is no agency", () => {
    expect(certificationLabel({ name: "Advanced Nitrox" })).toBe(
      "Advanced Nitrox",
    );
    expect(certificationLabel({ name: "Advanced Nitrox", agency: null })).toBe(
      "Advanced Nitrox",
    );
  });
});
