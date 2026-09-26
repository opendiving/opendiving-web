import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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

  // The selection moves on the click, before the route arrives, and gives way to the
  // pathname on its next change - including a swipe back to the page the click left.
  it("selects on the click, and follows the history back", () => {
    const shown = (name: string) =>
      screen
        .getByRole("link", { name })
        .classList.contains("[anchor-name:--settings-nav-shown]");
    // Cancelled before `Link` sees it: the router is not what is under test.
    const stay = (event: Event) => event.preventDefault();
    document.addEventListener("click", stay, true);
    try {
      const { rerender } = render(<SettingsNav />);
      fireEvent.click(screen.getByRole("link", { name: "Preferences" }));
      expect(shown("Preferences")).toBe(true);

      at.pathname = "/settings/preferences";
      rerender(<SettingsNav />);
      at.pathname = "/settings/account";
      rerender(<SettingsNav />);

      expect(shown("Account")).toBe(true);
      expect(shown("Preferences")).toBe(false);
    } finally {
      document.removeEventListener("click", stay, true);
    }
  });

  it("offers Invitations on an invite-only instance", () => {
    instance.config = { registration_mode: "invite", project_operated: true };
    render(<SettingsNav />);

    expect(labels()).toEqual([
      "Account",
      "Check-in",
      "Authentication",
      "Notifications",
      "Preferences",
      "Invitations",
    ]);
  });

  it("leaves Invitations out where anyone may register", () => {
    instance.config = { registration_mode: "open", project_operated: false };
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
