import { vi } from "vitest";

// `connection()` is how server modules tell `cacheComponents` to stop prerendering, and
// it throws outside a request scope - which a unit test calling them directly always
// is. The rest of `next/server` stays real: the middleware and proxy tests build
// `NextRequest`s from it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
