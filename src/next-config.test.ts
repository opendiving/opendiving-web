import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import nextConfig from "../next.config.js";

async function referrerPolicy(pathname: string): Promise<string | null> {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://dives.example.com${pathname}`,
    nextConfig,
  });
  return response.headers.get("Referrer-Policy");
}

describe("Referrer-Policy", () => {
  // Both pages hold a live, single-use token in their query until the click, and
  // a same-origin `Referer` would carry it on every request they make.
  it.each(["/auth/verify?token=tok", "/settings/confirm-email?token=tok"])(
    "sends none at all from %s",
    async (pathname) => {
      expect(await referrerPolicy(pathname)).toBe("no-referrer");
    },
  );

  it.each(["/", "/home", "/auth/verify/elsewhere", "/settings/account"])(
    "sends only the origin cross-origin from %s",
    async (pathname) => {
      expect(await referrerPolicy(pathname)).toBe(
        "strict-origin-when-cross-origin",
      );
    },
  );
});

describe("Permissions-Policy", () => {
  // The site finder's *Use my location* is the one feature named that the app
  // uses, and only from its own pages.
  it("lets this origin alone ask where the diver is, and no one the camera", async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: "https://dives.example.com/sites",
      nextConfig,
    });
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(self)",
    );
  });
});
