import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { usePointer } from "@/test/pointer";
import { useCoarsePointer } from "./useCoarsePointer";

function Probe() {
  return <output>{useCoarsePointer() ? "finger" : "mouse"}</output>;
}

const answer = () => screen.getByRole("status").textContent;

describe("useCoarsePointer", () => {
  beforeEach(() => usePointer("fine"));

  it("reports a mouse where the pointer hovers", () => {
    render(<Probe />);

    expect(answer()).toBe("mouse");
  });

  it("reports a finger on a device with no hover", () => {
    usePointer("coarse");
    render(<Probe />);

    expect(answer()).toBe("finger");
  });

  it("follows the query rather than reading it once", () => {
    // A tablet with a keyboard case picks up a mouse, or a laptop's touchscreen
    // is the last thing touched. Rare, but the answer decides which control the
    // diver is looking at, so it cannot be a mount-time snapshot.
    usePointer("coarse");
    render(<Probe />);
    expect(answer()).toBe("finger");

    act(() => usePointer("fine"));

    expect(answer()).toBe("mouse");
  });
});
