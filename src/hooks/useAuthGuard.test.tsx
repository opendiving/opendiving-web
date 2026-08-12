import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthGuard } from "./useAuthGuard";

const replace = vi.fn();
// Stable reference for the same reason as `useResource.test.tsx`: the guard's
// effect depends on the router, and a fresh object per render re-runs it.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let auth = { user: null as unknown, isAuthenticated: false, isLoading: false };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

let leaving = false;
vi.mock("@/lib/navigation", () => ({ isLeavingPage: () => leaving }));

beforeEach(() => {
  replace.mockClear();
  auth = { user: null, isAuthenticated: false, isLoading: false };
  leaving = false;
  window.history.replaceState({}, "", "/dives?page=2");
});

describe("useAuthGuard", () => {
  it("sends a signed-out visitor to sign-in, carrying where they were headed", async () => {
    renderHook(() => useAuthGuard());

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/signin?next=%2Fdives%3Fpage%3D2"),
    );
  });

  it("waits for the auth check rather than bouncing a page refresh", () => {
    auth = { user: null, isAuthenticated: false, isLoading: true };
    renderHook(() => useAuthGuard());

    expect(replace).not.toHaveBeenCalled();
  });

  // Signing out has already started a page load to `/`. Redirecting on top of
  // that can't change where the diver lands, only waste an RSC request on a
  // route they'll never see - and risk flashing it if that request wins.
  it("stands down once a page load is already under way", () => {
    leaving = true;
    renderHook(() => useAuthGuard());

    expect(replace).not.toHaveBeenCalled();
  });

  it("honours an explicit destination instead of adding next", async () => {
    renderHook(() => useAuthGuard("/"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
