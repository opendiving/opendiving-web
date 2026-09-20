import { useCallback, useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { DiveNumberingCard } from "./dive-numbering-card";
import type { DiveNumberingSummary, DiveRenumberResult } from "@/lib/api/dives";

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    getDiveNumbering: vi.fn(),
    renumberDives: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { divesAPI } = await import("@/lib/api/dives");

function summary(
  overrides: Partial<DiveNumberingSummary> = {},
): DiveNumberingSummary {
  return {
    total_dives: 3,
    lowest: 1,
    highest: 3,
    missing_count: 0,
    duplicate_count: 0,
    out_of_date_order_count: 0,
    is_sequential: true,
    ...overrides,
  };
}

const UNTIDY = summary({ out_of_date_order_count: 1 });
const TIDY = summary();

function renumberResult(dryRun: boolean): DiveRenumberResult {
  return {
    dry_run: dryRun,
    dives_in_scope: 3,
    changes: [
      {
        dive_uuid: "d1",
        start_time: "2026-04-17T11:49:00+02:00",
        dive_number: 3,
        new_dive_number: 1,
      },
    ],
  };
}

// The page around the card, reduced to the two parts that matter: the heading
// the card hands focus to, and the card itself.
function Page() {
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useCallback(() => heading.current?.focus(), []);

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Dives
      </h1>
      <DiveNumberingCard
        enabled
        onRenumbered={vi.fn()}
        onVanished={focusHeading}
      />
    </>
  );
}

// Opens the dialog and applies the renumber. The confirm button counts the
// changes, so waiting for it by name is waiting out the preview debounce.
async function renumber() {
  fireEvent.click(await screen.findByRole("button", { name: "Renumber" }));
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: "Renumber 1 dive" },
      { timeout: 2000 },
    ),
  );
}

describe("DiveNumberingCard", () => {
  beforeEach(() => {
    vi.mocked(divesAPI.renumberDives).mockImplementation(async (request) =>
      renumberResult(request?.dry_run === true),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hands focus on before a tidied log takes the button away", async () => {
    vi.mocked(divesAPI.getDiveNumbering)
      .mockResolvedValueOnce(UNTIDY)
      .mockResolvedValue(TIDY);

    render(<Page />);
    await renumber();

    // The card goes, because there is nothing left to renumber - and it takes
    // the Renumber button the dialog restored focus to with it. Unhanded,
    // focus would be on `<body>`, where nothing says what happened.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Renumber" })).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Dives" }),
    );
  });

  it("leaves focus alone when the card survives the renumber", async () => {
    // A renumber scoped to part of the log can leave the rest of it untidy.
    vi.mocked(divesAPI.getDiveNumbering).mockResolvedValue(UNTIDY);

    render(<Page />);
    await renumber();

    await waitFor(() =>
      expect(divesAPI.getDiveNumbering).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByRole("button", { name: "Renumber" })).toBeVisible();
    expect(document.activeElement).not.toBe(
      screen.getByRole("heading", { name: "Dives" }),
    );
  });
});
