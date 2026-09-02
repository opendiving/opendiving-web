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
// environment: jest-dom's matchers, cleanup between tests, and the one shim
// below.
//
// **`process` has to exist before any component importing `next/link` does.**
// This is not a browser API jsdom was standing in for - it is the opposite case,
// a *Node* global that Next's client code reads at module scope
// (`has-base-path.js` evaluates `process.env.__NEXT_ROUTER_BASEPATH` as it
// loads). In a real build Next inlines that to a literal and nothing survives to
// be read; in this project the module is bundled by Vite as-is, so importing
// `next/link` anywhere in the browser lane throws `ReferenceError: process is
// not defined` before a single test runs. It surfaces as a failed *import*
// rather than a failed assertion, which is why it looks nothing like a missing
// polyfill.
//
// The map tests never hit it because none of them renders a link. The first
// browser test over an app component that does - the species card's row-height
// guard - is what found it. An empty `env` is enough: every value Next looks for
// here is optional, and supplying real ones would be inventing build
// configuration a test has no business deciding.
globalThis.process ??= { env: {} } as NodeJS.Process;

afterEach(cleanup);
