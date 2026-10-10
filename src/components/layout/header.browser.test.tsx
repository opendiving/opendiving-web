import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { Header } from "./header";
import type { User } from "@/lib/api/auth";

// The layout under test is the stylesheet's: `fixed`, `w-2/3`, `invisible`
// and `md:hidden`.
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

async function renderOverPage() {
  render(
    <>
      <Header />
      <a href="#below" className="block h-[2000px]">
        Below the menu
      </a>
    </>,
  );
  const toggle = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(toggle);
  await slid();
  const menu = () => document.getElementById("mobile-menu")!;
  const backdrop = () => document.querySelector("[data-mobile-menu-backdrop]");
  // A point on the page left of the open menu, where a finger closing it would
  // land.
  const beside = { x: 20, y: 600 };
  return { toggle, menu, backdrop, beside };
}

// The menu slides and its backdrop fades over 300ms, and a box mid-slide is
// neither where it starts nor where it ends.
const slid = () => act(() => new Promise((done) => setTimeout(done, 350)));

const centre = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

describe("the mobile menu on a phone", () => {
  it("takes two thirds of the width, under the header", async () => {
    const { menu } = await renderOverPage();
    const box = menu().getBoundingClientRect();
    const header = document.querySelector("header")!.getBoundingClientRect();

    expect(box.right).toBe(window.innerWidth);
    expect(box.width).toBeCloseTo((window.innerWidth * 2) / 3, 0);
    expect(box.top).toBe(header.bottom);
    expect(box.bottom).toBe(window.innerHeight);
  });

  it("leaves the burger above the dimmed page, to close it again", async () => {
    const { toggle, menu } = await renderOverPage();
    const { x, y } = centre(toggle);
    expect(toggle.contains(document.elementFromPoint(x, y))).toBe(true);

    fireEvent.click(toggle);
    await slid();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(getComputedStyle(menu()).visibility).toBe("hidden");
  });

  it("takes a tap outside it on its backdrop, not on the page", async () => {
    const { backdrop, beside } = await renderOverPage();

    expect(document.elementFromPoint(beside.x, beside.y)).toBe(backdrop());
  });

  it("closes on that tap and hands the page back at once", async () => {
    const { toggle, backdrop, beside } = await renderOverPage();

    fireEvent.click(backdrop() as Element);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Still fading out, but no longer in the way.
    expect(document.elementFromPoint(beside.x, beside.y)).toHaveTextContent(
      "Below the menu",
    );
  });

  it("closes with the bell's panel on one tap outside both", async () => {
    const { toggle, backdrop } = await renderOverPage();
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

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Closed, and easing out under the stylesheet's exit animation.
    expect(
      document.querySelector(
        '[data-radix-popper-content-wrapper] [data-state="open"]',
      ),
    ).toBeNull();
  });
});
