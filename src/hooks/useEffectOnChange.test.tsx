import { Activity, useState } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEffectOnChange } from "./useEffectOnChange";

// The whole point of this hook is what React does to a *hidden* subtree, so these
// drive the real `<Activity>` rather than a stand-in for it: effects are destroyed
// on hide and re-created on show, while state survives. A test that only re-rendered
// would pass against a plain `useEffect` and pin nothing.
function Host({
  hidden,
  dep,
  run,
}: {
  hidden: boolean;
  dep: unknown;
  run: () => void;
}) {
  return (
    <Activity mode={hidden ? "hidden" : "visible"}>
      <Child dep={dep} run={run} />
    </Activity>
  );
}

function Child({ dep, run }: { dep: unknown; run: () => void }) {
  useEffectOnChange(run, [dep]);
  return null;
}

describe("useEffectOnChange", () => {
  it("runs on mount", () => {
    const run = vi.fn();
    renderHook(() => useEffectOnChange(run, ["a"]));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not run again when the deps are unchanged", () => {
    const run = vi.fn();
    const { rerender } = renderHook(
      ({ dep }) => useEffectOnChange(run, [dep]),
      { initialProps: { dep: "a" } },
    );

    rerender({ dep: "a" });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs again when a dep changes", () => {
    const run = vi.fn();
    const { rerender } = renderHook(
      ({ dep }) => useEffectOnChange(run, [dep]),
      { initialProps: { dep: "a" } },
    );

    rerender({ dep: "b" });

    expect(run).toHaveBeenCalledTimes(2);
  });

  // The regression this hook exists for. Delete the guard and this is 2.
  it("does not run again when a hidden subtree is shown with the same deps", () => {
    const run = vi.fn();
    const { rerender } = render(<Host hidden={false} dep="a" run={run} />);
    expect(run).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(<Host hidden dep="a" run={run} />);
    });
    act(() => {
      rerender(<Host hidden={false} dep="a" run={run} />);
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs on show when a dep changed while the subtree was hidden", () => {
    const run = vi.fn();
    const { rerender } = render(<Host hidden={false} dep="a" run={run} />);

    act(() => {
      rerender(<Host hidden dep="a" run={run} />);
    });
    act(() => {
      rerender(<Host hidden={false} dep="b" run={run} />);
    });

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs the cleanup it returned before running again", () => {
    const order: string[] = [];
    const { rerender } = renderHook(
      ({ dep }) =>
        useEffectOnChange(() => {
          order.push(`run ${dep}`);
          return () => order.push(`cleanup ${dep}`);
        }, [dep]),
      { initialProps: { dep: "a" } },
    );

    rerender({ dep: "b" });

    expect(order).toEqual(["run a", "cleanup a", "run b"]);
  });

  // State is what survives the hide; if it did not, every caller's guard would be
  // pointless because there would be nothing left to overwrite.
  it("leaves the subtree's own state alone across a hide", () => {
    function Counter() {
      const [n, setN] = useState(0);
      return <button onClick={() => setN((v) => v + 1)}>count {n}</button>;
    }
    function Wrapper({ hidden }: { hidden: boolean }) {
      return (
        <Activity mode={hidden ? "hidden" : "visible"}>
          <Counter />
        </Activity>
      );
    }

    const { rerender, getByRole } = render(<Wrapper hidden={false} />);
    act(() => getByRole("button").click());
    expect(getByRole("button").textContent).toBe("count 1");

    act(() => rerender(<Wrapper hidden />));
    act(() => rerender(<Wrapper hidden={false} />));

    expect(getByRole("button").textContent).toBe("count 1");
  });
});
