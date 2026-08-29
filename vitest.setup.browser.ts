import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// The browser project's setup, and it is deliberately almost empty.
//
// `vitest.setup.ts` is the other one, and none of it belongs here: every browser
// API it fills in for jsdom - `ResizeObserver`, `matchMedia`, pointer capture,
// `scrollIntoView` - is real in Chromium, and installing the stubs over the real
// implementations would break the behaviour these tests exist to check. That is
// why `vitest.config.mts` scopes `setupFiles` per project rather than setting it
// at the root, where projects would inherit it.
//
// What is left is the part that is about the test runner rather than about the
// environment: jest-dom's matchers, and cleanup between tests.
afterEach(cleanup);
