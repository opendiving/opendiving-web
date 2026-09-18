import { describe, expect, it, vi } from "vitest";

// `connection()` is how these modules tell `cacheComponents` to stop prerendering, and
// it throws outside a request scope - which a unit test calling the function directly
// always is.
vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET } from "./route";

describe("GET /healthz", () => {
  it("answers 200 with a body a container healthcheck can read", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok\n");
  });

  // A cached "ok" is a healthcheck that keeps passing after the app stops answering.
  it("is never cached", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });
});
