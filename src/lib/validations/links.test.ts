import { describe, expect, it } from "vitest";
import {
  linksField,
  linksFromForm,
  linksToForm,
  type LinkFormValue,
} from "./links";

const errorPaths = (rows: LinkFormValue[]) => {
  const result = linksField().safeParse(rows);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
};

const row = (url: string, label = ""): LinkFormValue => ({ url, label });

describe("linksField", () => {
  it("takes a blank row, which is dropped on save", () => {
    expect(errorPaths([row(""), row("  ")])).toEqual([]);
  });

  it("takes a bare host, which is sent with its scheme", () => {
    expect(errorPaths([row("blueocean.com", "Booking")])).toEqual([]);
  });

  it("refuses a label beside a blank address, on the address", () => {
    expect(errorPaths([row("", "Booking")])).toEqual(["0.url"]);
  });

  it("refuses an address the API would refuse, on its row", () => {
    expect(
      errorPaths([
        row("https://blueocean.example"),
        row("ftp://blueocean.com"),
        row("not a url"),
      ]),
    ).toEqual(["1.url", "2.url"]);
  });

  it("refuses an address longer than the API stores, scheme included", () => {
    // 504 characters typed, 512 once `https://` is added: the API's own limit.
    const typed = `blueocean.com/${"a".repeat(490)}`;
    expect(errorPaths([row(typed)])).toEqual([]);
    expect(errorPaths([row(`${typed}a`)])).toEqual(["0.url"]);
  });

  it("refuses a label past 120 characters", () => {
    expect(errorPaths([row("blueocean.com", "a".repeat(120))])).toEqual([]);
    expect(errorPaths([row("blueocean.com", "a".repeat(121))])).toEqual([
      "0.label",
    ]);
  });

  it("refuses a list past twenty rows", () => {
    expect(errorPaths(Array.from({ length: 20 }, () => row("")))).toEqual([]);
    expect(errorPaths(Array.from({ length: 21 }, () => row("")))).toEqual([""]);
  });
});

describe("linksFromForm", () => {
  it("builds the list the API stores", () => {
    expect(
      linksFromForm([
        row("  bluehole.example ", " Booking "),
        row(""),
        row("https://bluehole.example", "Again"),
        row("http://second.example/", "  "),
      ]),
    ).toEqual([
      { url: "https://bluehole.example", label: "Booking" },
      { url: "http://second.example/", label: null },
    ]);
  });

  it("leaves an address that names its scheme as typed", () => {
    expect(linksFromForm([row("ftp://blueocean.com")])).toEqual([
      { url: "ftp://blueocean.com", label: null },
    ]);
  });
});

describe("linksToForm", () => {
  it("reads a stored list, and none at all, as rows", () => {
    expect(
      linksToForm([
        { url: "https://a.example", label: null },
        { url: "https://b.example", label: "B" },
      ]),
    ).toEqual([row("https://a.example"), row("https://b.example", "B")]);
    expect(linksToForm(undefined)).toEqual([]);
  });
});
