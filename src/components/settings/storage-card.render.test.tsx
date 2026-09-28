import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StorageCard } from "./storage-card";

// What the card makes of the usage route's figures. The call itself is pinned in
// `lib/api/storage.test.ts`, the formatter in `lib/format.test.ts`, and the bar's
// geometry in `components/ui/meter.browser.test.tsx`, since jsdom lays nothing out.
const mocks = vi.hoisted(() => ({ getUsage: vi.fn() }));

vi.mock("@/lib/api/storage", () => ({
  storageAPI: { getUsage: mocks.getUsage },
}));

const MB = 1024 ** 2;
const GB = 1024 ** 3;

// A factory, so every call hands back a fresh object (see "A shared mock response
// object hides a render loop" in DECISIONS.md).
const usage = (overrides: Record<string, number | null> = {}) => ({
  used_bytes: 256 * MB,
  limit_bytes: GB,
  dive_files_bytes: 128 * MB,
  certification_files_bytes: 96 * MB,
  pictures_bytes: 32 * MB,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getUsage.mockImplementation(async () => usage());
});

describe("StorageCard", () => {
  it("shows the section spinner while the figures load", () => {
    mocks.getUsage.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StorageCard />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("exposes the used figure against zero and the limit, and says it", async () => {
    render(<StorageCard />);

    const meter = await screen.findByRole("meter", { name: "Storage used" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", String(GB));
    expect(meter).toHaveAttribute("aria-valuenow", String(256 * MB));
    expect(meter).toHaveAttribute("aria-valuetext", "256.0 MB of 1.0 GB used");
    expect(screen.getByText("256.0 MB of 1.0 GB used")).toBeInTheDocument();
    expect(screen.queryByText(/over its storage limit/)).toBeNull();
  });

  it("lists the three kinds with their figures", async () => {
    render(<StorageCard />);
    await screen.findByRole("meter");

    const figureFor = (label: string) =>
      within(screen.getByText(label).parentElement!).getByRole("definition");
    expect(figureFor("Dive-computer files")).toHaveTextContent("128.0 MB");
    expect(figureFor("Certification cards")).toHaveTextContent("96.0 MB");
    expect(figureFor("Profile picture and portrait")).toHaveTextContent(
      "32.0 MB",
    );
    expect(
      screen.getByText(/Dive-computer files are stored compressed/),
    ).toHaveTextContent(
      /before compression was introduced counts at its full size/,
    );
  });

  it("fills the bar and says so once the account is past its limit", async () => {
    mocks.getUsage.mockImplementation(async () =>
      usage({ used_bytes: GB + 512 * MB, dive_files_bytes: GB + 384 * MB }),
    );
    render(<StorageCard />);

    const meter = await screen.findByRole("meter");
    // ARIA keeps a meter's value inside its range; the real figure is the text.
    expect(meter).toHaveAttribute("aria-valuenow", String(GB));
    expect(meter).toHaveAttribute("aria-valuetext", "1.5 GB of 1.0 GB used");
    expect(
      screen.getByText(/Your account is over its storage limit/),
    ).toBeInTheDocument();
  });

  it("is not over its limit when exactly at it", async () => {
    mocks.getUsage.mockImplementation(async () =>
      usage({ used_bytes: GB, dive_files_bytes: GB - 128 * MB }),
    );
    render(<StorageCard />);

    await screen.findByRole("meter");
    expect(screen.queryByText(/over its storage limit/)).toBeNull();
  });

  it("shows totals and no bar where the instance sets no limit", async () => {
    mocks.getUsage.mockImplementation(async () => usage({ limit_bytes: null }));
    render(<StorageCard />);

    expect(await screen.findByText("256.0 MB used")).toBeInTheDocument();
    expect(
      screen.getByText("This copy of OpenDiving sets no storage limit."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByText("Dive-computer files")).toBeInTheDocument();
  });

  it("offers a retry when the figures fail to load, and shows them after it", async () => {
    mocks.getUsage.mockRejectedValueOnce({ response: { status: 500 } });
    render(<StorageCard />);

    expect(
      await screen.findByText("Couldn't load what your account is storing."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("meter")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("meter")).toBeInTheDocument();
    expect(mocks.getUsage).toHaveBeenCalledTimes(2);
  });

  it("shows the API's own message when it sends one", async () => {
    mocks.getUsage.mockRejectedValueOnce({
      response: { status: 503, data: { detail: "Try again in a minute." } },
    });
    render(<StorageCard />);

    expect(
      await screen.findByText("Try again in a minute."),
    ).toBeInTheDocument();
  });
});
