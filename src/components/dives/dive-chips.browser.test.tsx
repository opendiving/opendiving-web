import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { diveChips } from "./dive-chips";
import type { Dive } from "@/lib/api/dives";

const FINGER = { pointerType: "touch", pointerId: 7 };

function renderChips() {
  render(
    <>{diveChips({ type: "closed_circuit", tags: [] } as unknown as Dive)}</>,
  );
  return screen.getByText("CCR");
}

const hint = () => screen.queryByRole("tooltip");

// Radix listens for a press outside an open hint from the next tick on.
const nextTick = () => act(() => new Promise((done) => setTimeout(done, 0)));

describe("a dive chip under a finger", () => {
  it("says what it stands for on a tap", () => {
    const chip = renderChips();

    fireEvent.pointerDown(chip, FINGER);
    fireEvent.pointerUp(chip, FINGER);
    fireEvent.click(chip);

    expect(hint()).toHaveTextContent("Closed circuit");
  });

  it("stops saying it when a finger presses elsewhere", async () => {
    const chip = renderChips();
    fireEvent.pointerDown(chip, FINGER);
    fireEvent.pointerUp(chip, FINGER);
    fireEvent.click(chip);
    await nextTick();

    fireEvent.pointerDown(document.body, FINGER);
    await nextTick();

    expect(hint()).toBeNull();
  });

  it("leaves a mouse's click alone - it has hover for that", () => {
    const chip = renderChips();

    fireEvent.pointerDown(chip, { pointerType: "mouse" });
    fireEvent.click(chip);

    expect(hint()).toBeNull();
  });
});
