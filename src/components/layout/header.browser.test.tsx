import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { Header } from "./header";
import type { User } from "@/lib/api/auth";

// The layout under test is the stylesheet's: `fixed inset-0` and `md:hidden`.
import "@/app/globals.css";

const stable = vi.hoisted(() => ({
  auth: {
    user: null as User | null,
    isAuthenticated: true,
    isLoading: false,
    signOut: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoaded: true,
    serviceDue: { rows: [], truncated: false, failed: false },
    renewals: { rows: [], truncated: false, failed: false },
    policiesFailed: false,
    count: 0,
    reload: vi.fn(),
  }),
}));

const FINGER = { pointerType: "touch", pointerId: 7, button: 0 };

// Radix listens for a press outside an open layer from the next tick on.
const nextTick = () => act(() => new Promise((done) => setTimeout(done, 0)));

beforeEach(async () => {
  await page.viewport(375, 800);
  stable.auth.user = {
    uuid: "user-1",
    name: "Sam Reef",
    username: "samreef",
    email: "sam@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
    dive_form_preset_uuid: null,
  } as User;
});

function renderOverPage() {
  render(
    <>
      <Header />
      <a href="#below" className="block h-[2000px]">
        Below the menu
      </a>
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  const menu = () => document.getElementById("mobile-menu");
  const backdrop = () => document.querySelector("[data-mobile-menu-backdrop]");
  // A point on the page under the open menu's foot, where a finger closing it
  // would land.
  const below = { x: 20, y: 790 };
  return { menu, backdrop, below };
}

describe("the mobile menu on a phone", () => {
  it("takes a tap outside it on its backdrop, not on the page", () => {
    const { menu, backdrop, below } = renderOverPage();
    expect(menu()?.getBoundingClientRect().bottom).toBeLessThan(below.y);

    expect(document.elementFromPoint(below.x, below.y)).toBe(backdrop());
  });

  it("closes on that tap and hands the page back", () => {
    const { menu, backdrop, below } = renderOverPage();

    fireEvent.click(backdrop() as Element);

    expect(menu()).toBeNull();
    expect(document.elementFromPoint(below.x, below.y)).toHaveTextContent(
      "Below the menu",
    );
  });

  it("closes with the bell's panel on one tap outside both", async () => {
    const { menu, backdrop } = renderOverPage();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await nextTick();
    expect(
      document.querySelector(
        '[data-radix-popper-content-wrapper] [data-state="open"]',
      ),
    ).not.toBeNull();

    const outside = backdrop() as Element;
    fireEvent.pointerDown(outside, FINGER);
    fireEvent.pointerUp(outside, FINGER);
    fireEvent.click(outside);
    await nextTick();

    expect(menu()).toBeNull();
    // Closed, and easing out under the stylesheet's exit animation.
    expect(
      document.querySelector(
        '[data-radix-popper-content-wrapper] [data-state="open"]',
      ),
    ).toBeNull();
  });
});
