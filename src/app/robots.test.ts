import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("closes the whole site when WEB_NOINDEX is set", async () => {
    const robots = await loadRobots({ WEB_NOINDEX: "true" });

    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  // Same vocabulary as every other flag in `lib/runtime-config.ts`, rather than
  // `true`-only.
  it("takes the other spellings of yes", async () => {
    const robots = await loadRobots({ WEB_NOINDEX: "ON" });

    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
