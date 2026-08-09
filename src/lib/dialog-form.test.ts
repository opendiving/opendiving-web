import { describe, it, expect, vi } from "vitest";
import { dialogFormSubmit } from "./dialog-form";

function fakeSubmitEvent() {
  return {
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as Parameters<ReturnType<typeof dialogFormSubmit>>[0];
}

describe("dialogFormSubmit", () => {
  it("stops the event before the wrapped handler can run", () => {
    const event = fakeSubmitEvent();
    const order: string[] = [];
    const stopPropagation = event.stopPropagation as unknown as ReturnType<
      typeof vi.fn
    >;
    stopPropagation.mockImplementation(() => order.push("stopPropagation"));

    dialogFormSubmit(() => order.push("handler"))(event);

    // The outer dive form must be shielded even if the inner handler throws or
    // is async - so propagation is stopped first, not after awaiting it.
    expect(order).toEqual(["stopPropagation", "handler"]);
  });

  it("passes the event through to the wrapped handler", () => {
    const event = fakeSubmitEvent();
    const handler = vi.fn();

    dialogFormSubmit(handler)(event);

    // react-hook-form's handleSubmit needs the event itself to preventDefault().
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not swallow the handler's own errors", () => {
    const event = fakeSubmitEvent();
    const boom = new Error("boom");

    expect(() =>
      dialogFormSubmit(() => {
        throw boom;
      })(event),
    ).toThrow(boom);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
});
