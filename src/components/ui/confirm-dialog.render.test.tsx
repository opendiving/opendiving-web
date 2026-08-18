import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
