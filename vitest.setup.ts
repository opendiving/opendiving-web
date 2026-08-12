import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library's own auto-cleanup only runs when it detects a global `afterEach`,
// which it does under Vitest - but registering it explicitly means a component test
// that forgets `render` isolation still can't leak DOM into the next one.
afterEach(cleanup);

// jsdom implements neither, and Radix (dialogs, selects, popovers) and the app's own
// responsive hooks both reach for them on mount. Without these, every test that
// renders a dialog throws before it reaches its assertion.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix's popper measures with these; jsdom reports zeroes and warns without them.
Element.prototype.scrollIntoView = vi.fn();
