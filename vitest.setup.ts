import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import {
  clearIntersectionObservers,
  installIntersectionObserverStub,
} from "./src/test/intersection";

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

// Same reason, one layer up: `LoadMoreTrigger` observes its button so a list
// pulls its next page in as the diver scrolls, and `new IntersectionObserver`
// throws outright in jsdom. The stub reports nothing until a test says the
// reader has scrolled there - see `src/test/intersection.ts` for why that is the
// honest default and how to ask for the other answer.
installIntersectionObserverStub();
afterEach(clearIntersectionObservers);

// Radix's popper measures with these; jsdom reports zeroes and warns without them.
Element.prototype.scrollIntoView = vi.fn();

// Radix's `Select` captures the pointer on the trigger before it will open its
// listbox, and jsdom implements none of the three. Without them the trigger
// throws on pointerdown instead of opening, which surfaces as "unable to find
// role=listbox" rather than as anything about pointer capture.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

// jsdom implements no Web Animations API, and `ui/calendar.tsx` slides between
// months with `Element.animate`. The stub finishes at once and reports itself
// idle, which is the right answer for a test asking which month is on screen
// rather than how it got there - the sliding itself is a browser's to show.
Element.prototype.animate = () =>
  ({
    finished: Promise.resolve(),
    cancel: () => {},
    playState: "finished",
  }) as unknown as Animation;
