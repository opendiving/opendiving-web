import { render } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { vi } from "vitest";

/**
 * The fixtures a page-frame test needs: a signed-in diver, a router that answers, and an
 * API that answers nothing - which is what a page looks like in the instant between the
 * click and its data.
 *
 * Shared rather than repeated because the admin section is scanned for imports from
 * outside it (`lib/admin-isolation.test.ts`), so its frame check lives in its own
 * directory and would otherwise carry a second copy of all of this.
 *
 * The `vi.mock` calls themselves stay in each test file - they are hoisted above every
 * import and cannot be handed out - but their factories can reach this object through
 * `await import(...)`.
 */
export const frameMocks = {
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
export function resetFrameMocks(): void {
  frameMocks.at.pathname = "/";
  frameMocks.params = {};
  frameMocks.searchParams = new URLSearchParams();
}

type Drawable = ComponentType<{ children?: ReactNode }>;

/**
 * Renders one page at one path, with its data left in flight, and hands back what it
 * drew. The path is set before the module is loaded because a page reads it during its
 * first render, which is the render being inspected.
 */
export async function drawFrame(
  path: string,
  load: () => Promise<{ default: unknown }>,
  props: { children?: ReactNode } = {},
): Promise<ReturnType<typeof render>> {
  frameMocks.at.pathname = path;
  const Component = (await load()).default as Drawable;
  return render(<Component {...props} />);
}
