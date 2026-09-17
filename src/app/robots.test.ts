import { afterEach, describe, expect, it, vi } from "vitest";

// `connection()` is how these modules tell `cacheComponents` to stop prerendering, and
// it throws outside a request scope - which a unit test calling the function directly
// always is.
vi.mock("next/server", () => ({ connection: async () => {} }));

// `runtimeConfig()` memoizes, so each case needs its own module instance - see
// `src/proxy.test.ts` for the same dance.
async function loadRobots(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("./robots")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots", () => {
  it("lets crawlers in by default", async () => {
    const robots = await loadRobots();

    expect((await robots()).rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("closes the whole site when WEB_NOINDEX is set", async () => {
    const robots = await loadRobots({ WEB_NOINDEX: "true" });

    expect((await robots()).rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  // Same vocabulary as every other flag in `lib/runtime-config.ts`, rather than
  // `true`-only.
  it("takes the other spellings of yes", async () => {
    const robots = await loadRobots({ WEB_NOINDEX: "ON" });

    expect((await robots()).rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
