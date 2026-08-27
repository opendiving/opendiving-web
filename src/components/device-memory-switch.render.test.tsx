import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";

import { DeviceMemorySwitch } from "./device-memory-switch";
import {
  DEVICE_MEMORY_OPT_OUT_KEY,
  installDeviceMemorySuppression,
} from "@/lib/device-memory";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// What this file can and cannot settle, said once. The cross-document half of
// the theme story - the pre-hydration script's first paint, and a second tab's
// next-themes rewrite being dropped - needs a real browser: jsdom runs neither,
// so an assertion about either would pass against any implementation at all.
// What *is* real here is next-themes itself, because `vitest.setup.ts` stubs
// `matchMedia`, so the provider resolves `system` and applies its class exactly
// as it does in a browser. That is the assertion below.

const theSwitch = () =>
  screen.getByRole("checkbox", {
    name: /remember display preferences on this device/i,
  });

beforeEach(() => {
  useStorage(memoryStorage());
  installDeviceMemorySuppression();
  document.documentElement.className = "";
});

describe("DeviceMemorySwitch", () => {
  it("starts from what storage says", async () => {
    window.localStorage.setItem(DEVICE_MEMORY_OPT_OUT_KEY, "1");

    render(<DeviceMemorySwitch />);

    await waitFor(() => expect(theSwitch()).toBeChecked());
  });

  it("records the objection, and takes it back", async () => {
    const user = userEvent.setup();
    render(<DeviceMemorySwitch />);

    await user.click(theSwitch());
    expect(
      window.localStorage.getItem(DEVICE_MEMORY_OPT_OUT_KEY),
    ).not.toBeNull();
    expect(theSwitch()).toBeChecked();

    await user.click(theSwitch());
    expect(window.localStorage.getItem(DEVICE_MEMORY_OPT_OUT_KEY)).toBeNull();
    expect(theSwitch()).not.toBeChecked();
  });

  // The mirror, in the only form a unit test can see it: `/privacy` §10.3 and
  // the `/settings` device card render this same component, so the property
  // that matters is that two instances share one state rather than each
  // carrying their own.
  it("renders one state across every surface showing it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <div data-testid="privacy">
          <DeviceMemorySwitch />
        </div>
        <div data-testid="settings">
          <DeviceMemorySwitch />
        </div>
      </>,
    );

    const [onPrivacy, onSettings] = screen.getAllByRole("checkbox");
    expect(onPrivacy).not.toBeChecked();
    expect(onSettings).not.toBeChecked();

    await user.click(onSettings);

    await waitFor(() => expect(onPrivacy).toBeChecked());
    expect(onSettings).toBeChecked();
  });

  // The fifth owner decision, and the half of it jsdom can hold: a same-document
  // `removeItem` fires no `storage` event and next-themes has no other change
  // detection, so without the control's own `setTheme` this tab would keep its
  // dark theme until reload while every other open tab reverted at once. The
  // suppressed write inside that call is what keeps the key from coming back.
  it("settles the initiating tab's theme, and stores nothing doing it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "dark");

    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <DeviceMemorySwitch />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );

    await user.click(theSwitch());

    // `matchMedia` is stubbed to report no dark preference, so `system`
    // resolves light - which is the point: the tab settles on the default
    // rather than keeping a preference nothing is storing any more.
    await waitFor(() =>
      expect(document.documentElement.classList.contains("light")).toBe(true),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("does not throw where the browser refuses storage", async () => {
    const user = userEvent.setup();
    useStorage(undefined);

    render(<DeviceMemorySwitch />);

    await user.click(theSwitch());
    expect(theSwitch()).not.toBeChecked();
  });
});
