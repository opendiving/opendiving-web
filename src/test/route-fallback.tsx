import { render } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { vi } from "vitest";
import { clearRouteHold } from "@/lib/route-hold";

/**
 * The fixtures a `loading.tsx` parity test needs: a signed-in diver, a router that
 * answers, and an API that answers nothing - which is what a soft navigation into a page
 * looks like in the instant the fallback covers.
 *
 * Shared rather than repeated because the admin section is scanned for imports from
 * outside it (`lib/admin-isolation.test.ts`), so its parity check lives in its own
 * directory and would otherwise carry a second copy of all of this.
 *
 * The `vi.mock` calls themselves stay in each test file - they are hoisted above every
 * import and cannot be handed out - but their factories can reach this object through
 * `await import(...)`.
 */
export const fallbackMocks = {
  at: { pathname: "/" },
  auth: {
    user: {
      uuid: "user-1",
      name: "Sam",
      email: "sam@example.com",
      units: "metric",
      is_superuser: true,
    },
    isAuthenticated: true,
    isLoading: false,
  },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  },
  params: {} as Record<string, string>,
  searchParams: new URLSearchParams(),
  toast: { toast: vi.fn(), dismiss: vi.fn(), toasts: [] },
  openCreate: vi.fn(),
  apiClient: {
    get: pending,
    post: pending,
    put: pending,
    patch: pending,
    delete: pending,
    request: pending,
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
};

function pending() {
  return new Promise(() => {});
}

/** Back to a diver who has navigated nowhere and asked for nothing. */
export function resetFallbackMocks(): void {
  fallbackMocks.at.pathname = "/";
  fallbackMocks.params = {};
  fallbackMocks.searchParams = new URLSearchParams();
  clearRouteHold();
}

/**
 * React's `useId` values differ between two renders of the same tree, and the route hold
 * is a delay measured from each render's own clock. Neither is the shape being compared.
 */
export const normaliseFrame = (html: string) =>
  html
    .replace(/«[^»]*»/g, "«id»")
    .replace(/ style="--skeleton-delay: ?[^"]*"/g, "")
    .replace(
      /(id|for|aria-labelledby|aria-controls|aria-describedby)="[^"]*"/g,
      '$1="id"',
    );

type Drawable = ComponentType<{ children?: ReactNode }>;

/** Renders one component at one path and hands back its markup, normalised. */
export async function drawFrame(
  path: string,
  load: () => Promise<{ default: unknown }>,
  props: { children?: ReactNode } = {},
): Promise<string> {
  fallbackMocks.at.pathname = path;
  const Component = (await load()).default as Drawable;
  const view = render(<Component {...props} />);
  const html = normaliseFrame(view.container.innerHTML);
  view.unmount();
  clearRouteHold();
  return html;
}
