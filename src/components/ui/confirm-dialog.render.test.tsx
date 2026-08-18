import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

// `secondaryAction` is the only footer button that is neither Cancel nor confirm,
// and the whole point of it is that it does its own thing instead of the
// destructive one. These pin that separation, and that it is gone by default.

const open = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Delete gear"
      confirmText="Delete"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm };
};

describe("ConfirmDialog secondaryAction", () => {
  it("renders no third button when none is offered", () => {
    open();

    expect(screen.getAllByRole("button")).toHaveLength(
      // Cancel, Delete, and the dialog's own close button.
      3,
    );
  });

  it("runs the secondary action and leaves the confirm alone", async () => {
    const onClick = vi.fn();
    const { onConfirm } = open({
      secondaryAction: { label: "Archive instead", onClick },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Archive instead" }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks the secondary action while the delete it diverts from is in flight", () => {
    open({
      isLoading: true,
      secondaryAction: { label: "Archive instead", onClick: vi.fn() },
    });

    expect(
      screen.getByRole("button", { name: "Archive instead" }),
    ).toBeDisabled();
  });

  it("stays available while `confirmDisabled` blocks the confirm", () => {
    // `confirmDisabled` is about the dialog's own content being incomplete, which
    // says nothing about whether the gentler action can be taken.
    open({
      confirmDisabled: true,
      secondaryAction: { label: "Archive instead", onClick: vi.fn() },
    });

    expect(
      screen.getByRole("button", { name: "Archive instead" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("does not let a press on the footer move focus", () => {
    // The one line holding a real bug shut, and jsdom cannot show the bug
    // itself: the focus change is the *browser's* default action for a pointer
    // press, which jsdom does not perform, so only the `preventDefault` that
    // suppresses it can be pinned here.
    //
    // What it prevents: a confirm button disabled by the dialog's own content
    // gets `pointer-events: none`, so the press lands on the footer, blurs the
    // field, and the blur can clear what was disabling the button - and since
    // `disabled` is re-read at each event's dispatch, the same gesture's click
    // then lands on a now-enabled button. The delete picker's half-typed
    // destination was exactly that: the trip deleted and the move dropped.
    open({ confirmDisabled: true });

    const footer = screen.getByRole("button", {
      name: "Delete",
    }).parentElement!;
    const press = fireEvent.mouseDown(footer);

    // `fireEvent` returns false when a handler called `preventDefault`.
    expect(press).toBe(false);
  });
});
