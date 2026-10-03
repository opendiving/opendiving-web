import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { InstanceConfig } from "@/lib/api/config";
import { SettingsNav } from "./settings-nav";

const at = vi.hoisted(() => ({ pathname: "/settings/account" }));
const instance = vi.hoisted(() => ({
  config: null as InstanceConfig | null,
  isLoading: false,
}));

vi.mock("next/navigation", () => ({ usePathname: () => at.pathname }));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => instance,
}));

const labels = () =>
  screen.getAllByRole("link").map((link) => link.textContent);

// Which entry the pill is tethered to, and whether it slides there.
const shown = (name: string) =>
  screen
    .getByRole("link", { name })
    .classList.contains("[anchor-name:--settings-nav-shown]");
const slides = () => !screen.getByRole("list").hasAttribute("data-instant");

const popState = ({
  hasUAVisualTransition,
}: {
  hasUAVisualTransition: boolean;
}) => {
  const event = new PopStateEvent("popstate");
  Object.defineProperty(event, "hasUAVisualTransition", {
    value: hasUAVisualTransition,
  });
  act(() => {
    window.dispatchEvent(event);
  });
};

beforeEach(() => {
  at.pathname = "/settings/account";
  instance.config = null;
});

describe("SettingsNav", () => {
  it("marks the section being shown, and only that one", () => {
    at.pathname = "/settings/authentication";
    render(<SettingsNav />);

    expect(
      screen.getByRole("link", { name: "Authentication" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  // Not ahead of the route on the tap: Safari snapshots the page being left as the URL
  // changes, and a swipe back shows that snapshot.
  it("moves the selection with the pathname, and follows it back", () => {
    // Cancelled before `Link` sees it: the router is not what is under test.
    const stay = (event: Event) => event.preventDefault();
    document.addEventListener("click", stay, true);
    try {
      const { rerender } = render(<SettingsNav />);
      fireEvent.click(screen.getByRole("link", { name: "Preferences" }));
      expect(shown("Account")).toBe(true);

      at.pathname = "/settings/preferences";
      rerender(<SettingsNav />);
      expect(shown("Preferences")).toBe(true);

      at.pathname = "/settings/account";
      rerender(<SettingsNav />);
      expect(shown("Account")).toBe(true);
      expect(shown("Preferences")).toBe(false);
    } finally {
      document.removeEventListener("click", stay, true);
    }
  });

  // A swipe the browser animated was the move, so the pill jumps after it; a tap slides.
  it("jumps after a browser-animated history step, and slides otherwise", () => {
    const stay = (event: Event) => event.preventDefault();
    document.addEventListener("click", stay, true);
    try {
      render(<SettingsNav />);
      expect(slides()).toBe(true);

      popState({ hasUAVisualTransition: true });
      expect(slides()).toBe(false);

      popState({ hasUAVisualTransition: false });
      expect(slides()).toBe(true);

      popState({ hasUAVisualTransition: true });
      fireEvent.click(screen.getByRole("link", { name: "Preferences" }));
      expect(slides()).toBe(true);
    } finally {
      document.removeEventListener("click", stay, true);
    }
  });

  // The router's `popstate` listener is registered first and can render the new page
  // synchronously; the list has to be marked before it runs, not after.
  it("marks the jump before an older popstate listener runs", () => {
    let markedWhenRouterRan: boolean | undefined;
    const router = () => {
      markedWhenRouterRan = !slides();
    };
    window.addEventListener("popstate", router);
    try {
      render(<SettingsNav />);
      popState({ hasUAVisualTransition: true });
      expect(markedWhenRouterRan).toBe(true);
    } finally {
      window.removeEventListener("popstate", router);
    }
  });

  // Where the Navigation API exists the router renders a step back on `navigate`, before
  // `popstate`; the router's own `replace` after it must not clear the mark.
  it("marks the jump on a traverse navigate event, and keeps it through a replace", () => {
    const navigation = new EventTarget();
    Object.defineProperty(window, "navigation", {
      value: navigation,
      configurable: true,
    });
    const navigate = (
      navigationType: string,
      hasUAVisualTransition: boolean,
    ) => {
      const event = new Event("navigate");
      Object.defineProperties(event, {
        navigationType: { value: navigationType },
        hasUAVisualTransition: { value: hasUAVisualTransition },
      });
      act(() => {
        navigation.dispatchEvent(event);
      });
    };
    try {
      render(<SettingsNav />);
      navigate("traverse", true);
      expect(slides()).toBe(false);
      navigate("replace", false);
      expect(slides()).toBe(false);
      navigate("traverse", false);
      expect(slides()).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "navigation");
    }
  });

  it("offers Invitations on an invite-only instance", () => {
    instance.config = {
      registration_mode: "invite",
      project_operated: true,
      join_links: false,
      map_pictures: false,
    };
    render(<SettingsNav />);

    expect(labels()).toEqual([
      "Account",
      "Check-in",
      "Authentication",
      "Storage",
      "Notifications",
      "Preferences",
      "Invitations",
    ]);
  });

  it("leaves Invitations out where anyone may register", () => {
    instance.config = {
      registration_mode: "open",
      project_operated: false,
      join_links: false,
      map_pictures: false,
    };
    render(<SettingsNav />);

    expect(labels()).not.toContain("Invitations");
  });

  it("keeps Invitations while the mode is not known", () => {
    // A failed or pending `/config` is not an answer, and the page behind the entry
    // explains itself on an open instance.
    render(<SettingsNav />);

    expect(labels()).toContain("Invitations");
  });
});
