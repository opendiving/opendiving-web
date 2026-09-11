// An `IntersectionObserver` for jsdom, which implements none.
//
// It has to exist at all because `new IntersectionObserver` throws outright
// without it: `LoadMoreTrigger` observes its button so a list pulls the next
// page in as the diver scrolls, and every page rendering a list would fail on
// mount rather than at an assertion.
//
// It reports nothing by default, which is the honest answer - whether an element
// is near the viewport is a layout question, and "jsdom answers no layout
// question" (DECISIONS.md). A test that wants the answer says so with `reveal`,
// which is a statement about the scenario rather than about the environment: the
// reader has scrolled to the end of the list, or far enough down the gear page
// to reach the sets card. Anything genuinely about *when* the browser decides an
// element is near belongs in the browser lane.
//
// Installed globally from `vitest.setup.ts`, unlike `memoryStorage`, because the
// stub holds no per-test state a suite could leak through - `reveal` is a
// one-shot call over whatever is mounted right now, and the registry is cleared
// after every test.

interface Registration {
  element: Element;
  callback: IntersectionObserverCallback;
  observer: IntersectionObserver;
}

const registrations: Registration[] = [];

class StubIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(element: Element) {
    registrations.push({ element, callback: this.callback, observer: this });
  }

  unobserve(element: Element) {
    for (let i = registrations.length - 1; i >= 0; i -= 1) {
      if (
        registrations[i].observer === this &&
        registrations[i].element === element
      ) {
        registrations.splice(i, 1);
      }
    }
  }

  disconnect() {
    for (let i = registrations.length - 1; i >= 0; i -= 1) {
      if (registrations[i].observer === this) registrations.splice(i, 1);
    }
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

export function installIntersectionObserverStub() {
  window.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver;
}

export function clearIntersectionObservers() {
  registrations.length = 0;
}

/**
 * Report every element currently under observation as on screen - "the reader
 * has scrolled to it".
 *
 * Wrap the call in `act()`: it runs React state updates synchronously. The list
 * is copied first because a callback can mount or unmount observed nodes, which
 * would otherwise mutate the array mid-iteration.
 */
export function reveal() {
  for (const { element, callback, observer } of [...registrations]) {
    callback(
      [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
      observer,
    );
  }
}
