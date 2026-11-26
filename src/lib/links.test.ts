import { describe, expect, it } from "vitest";
import {
  formatLinkAddress,
  isLinkUrl,
  linkText,
  normalizeLinkUrl,
} from "./links";

const ok = (url: string) => isLinkUrl(url, 512);

describe("normalizeLinkUrl", () => {
  it("gives a bare host the scheme the API requires", () => {
    // What a diver copies off a sign; the API refuses it without a scheme.
    expect(normalizeLinkUrl("blueocean.com")).toBe("https://blueocean.com");
    expect(normalizeLinkUrl("  www.blueocean.com/dahab ")).toBe(
      "https://www.blueocean.com/dahab",
    );
  });

  it("leaves a URL that already names its scheme as typed", () => {
    expect(normalizeLinkUrl("http://blueocean.com")).toBe(
      "http://blueocean.com",
    );
    expect(normalizeLinkUrl("ftp://blueocean.com")).toBe("ftp://blueocean.com");
  });

  it("reads an empty box as no address", () => {
    expect(normalizeLinkUrl("")).toBeNull();
    expect(normalizeLinkUrl("   ")).toBeNull();
  });
});

// Each case is one the API's `check_link_url` was asked about, and answers the same.
describe("isLinkUrl", () => {
  it("takes an http or https address with a host", () => {
    expect(ok("https://blueocean.example")).toBe(true);
    expect(ok("HTTP://blueocean.example/dahab?lang=en#map")).toBe(true);
    expect(ok("https://user@blueocean.example:8443/")).toBe(true);
    expect(ok("https://[::1]:8080/")).toBe(true);
    expect(ok("https://[fe80::1%25eth0]/")).toBe(true);
    expect(ok("https://[::ffff:192.0.2.1]/")).toBe(true);
    expect(ok("https://[v1.fe]/")).toBe(true);
    expect(ok("https://[::]/")).toBe(true);
    expect(ok("https://[1:2:3:4:5:6:7::]/")).toBe(true);
    expect(ok("https://[::2:3:4:5:6:7:8]/")).toBe(true);
    expect(ok("https://[1:2:3:4:5:6:7:8]/")).toBe(true);
    expect(ok("https://h@[::1]/")).toBe(true);
    expect(ok("https://blüeocean.example/")).toBe(true);
  });

  it("refuses another scheme, or no host", () => {
    expect(ok("ftp://blueocean.example")).toBe(false);
    expect(ok("mailto:info@blueocean.example")).toBe(false);
    expect(ok("https:blueocean.example")).toBe(false);
    expect(ok("https://")).toBe(false);
    expect(ok("https:///path")).toBe(false);
    expect(ok("blueocean.example")).toBe(false);
  });

  it("refuses anything before the scheme", () => {
    expect(ok("\u0000https://blueocean.example")).toBe(false);
    expect(ok("\u0001https://blueocean.example")).toBe(false);
  });

  it("refuses every character of the format's whitespace class, anywhere", () => {
    for (const space of [
      " ",
      "\t",
      "\n",
      "\u000b",
      "\u001c",
      "\u001f",
      "\u0085",
      " ",
      " ",
      " ",
      " ",
      " ",
      " ",
      " ",
      " ",
      "　",
      "﻿",
    ]) {
      expect(ok(`https://blueocean.example/a${space}b`)).toBe(false);
    }
    // Outside the class: a zero-width space is not whitespace to either engine.
    expect(ok("https://blueocean.example/a​b")).toBe(true);
  });

  it("refuses a host `urlsplit` cannot split", () => {
    expect(ok("https://[::1/")).toBe(false);
    expect(ok("https://::1]/")).toBe(false);
    expect(ok("https://[127.0.0.1]/")).toBe(false);
    expect(ok("https://[blueocean]/")).toBe(false);
    expect(ok("https://a[::1]/")).toBe(false);
    expect(ok("https://[::1]x/")).toBe(false);
    expect(ok("https://[v1]/")).toBe(false);
    expect(ok("https://[1:2:3:4:5:6:7:8:9]/")).toBe(false);
    expect(ok("https://[1::2::3]/")).toBe(false);
    expect(ok("https://[:1:2:3:4:5:6:7]/")).toBe(false);
    expect(ok("https://[1:2:3:4:5:6:7:]/")).toBe(false);
    expect(ok("https://[::1.2.3.04]/")).toBe(false);
    expect(ok("https://[::1]@host/")).toBe(false);
    // U+2100 is "a/c" under NFKC, a path in the host.
    expect(ok("https://℀.example/")).toBe(false);
  });

  it("counts the bound in characters, as the API does", () => {
    const head = "https://blueocean.example/";
    expect(isLinkUrl(`${head}${"\u{1f420}".repeat(4)}`, head.length + 4)).toBe(
      true,
    );
    expect(isLinkUrl(`${head}${"a".repeat(5)}`, head.length + 4)).toBe(false);
  });
});

describe("formatLinkAddress", () => {
  it("drops the scheme and a bare trailing slash", () => {
    expect(formatLinkAddress("https://blueocean.example/")).toBe(
      "blueocean.example",
    );
    expect(formatLinkAddress("http://blueocean.example/dahab?lang=en")).toBe(
      "blueocean.example/dahab?lang=en",
    );
  });

  it("shows an address it cannot parse as it is", () => {
    expect(formatLinkAddress("blueocean")).toBe("blueocean");
  });
});

describe("linkText", () => {
  it("is the label, or the address without its scheme", () => {
    expect(linkText({ url: "https://a.example/", label: "Booking" })).toBe(
      "Booking",
    );
    expect(linkText({ url: "https://a.example/", label: null })).toBe(
      "a.example",
    );
  });
});
