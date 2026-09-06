import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteRequestsTable } from "./invite-requests-table";
import type { AdminInviteRequest } from "@/lib/api/admin";

const request = (
  overrides: Partial<AdminInviteRequest> = {},
): AdminInviteRequest => ({
  email: "first@example.com",
  created_at: "2026-09-01T10:00:00+00:00",
  has_account: false,
  ...overrides,
});

const SECOND = request({ email: "second@example.com" });

const draw = (props: Partial<Parameters<typeof InviteRequestsTable>[0]> = {}) =>
  render(
    <InviteRequestsTable
      requests={[request(), SECOND]}
      isLoading={false}
      itemsPerPage={10}
      selected={[]}
      onToggle={vi.fn()}
      onToggleAll={vi.fn()}
      {...props}
    />,
  );

describe("the invite requests table", () => {
  it("names each row's switch after its address", () => {
    // A screen reader's controls list is flat: a page of identical "Select"es
    // names nothing. See "Ten rows of 'Edit' name nothing" in DECISIONS.md.
    draw();

    expect(
      screen.getByRole("switch", { name: "Select first@example.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Select second@example.com" }),
    ).toBeInTheDocument();
  });

  it("leaves the select-all off while only some rows are selected", () => {
    // A switch has two states and no `indeterminate`, so a partial selection
    // reads as off here. What says "some" is the page's own "N addresses
    // selected", in an `aria-live` region directly above this table - which was
    // always the half of that pair a screen reader actually announced.
    draw({ selected: ["first@example.com"] });

    expect(
      screen.getByRole("switch", {
        name: "Select every request on this page",
      }),
    ).not.toBeChecked();
  });

  it("turns the select-all on once every row is selected", () => {
    draw({ selected: ["first@example.com", "second@example.com"] });

    expect(
      screen.getByRole("switch", {
        name: "Select every request on this page",
      }),
    ).toBeChecked();
  });

  it("tells the page which address was switched on", async () => {
    const onToggle = vi.fn();
    draw({ onToggle });

    await userEvent.click(
      screen.getByRole("switch", { name: "Select second@example.com" }),
    );

    expect(onToggle).toHaveBeenCalledWith("second@example.com", true);
  });

  it("switches off a row it was given as selected", async () => {
    const onToggle = vi.fn();
    draw({ selected: ["first@example.com"], onToggle });

    await userEvent.click(
      screen.getByRole("switch", { name: "Select first@example.com" }),
    );

    expect(onToggle).toHaveBeenCalledWith("first@example.com", false);
  });

  it("keeps its column headings while the first page is still loading", () => {
    // Placeholder rows inside the real table, rather than a spinner in place of
    // it, so the page does not jump when the rows land.
    draw({ requests: [], isLoading: true });

    expect(
      screen.getByRole("columnheader", { name: "Address" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nobody is waiting/)).not.toBeInTheDocument();
  });

  it("says the queue is empty only once it is known to be", () => {
    draw({ requests: [], isLoading: false });

    expect(screen.getByText(/Nobody is waiting/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says nothing about how registration on this instance works", () => {
    // The queue is described by what it holds. The admin routes ignore the
    // registration mode, so this table renders on an open instance too.
    draw({ requests: [], isLoading: false });

    expect(document.body.textContent).not.toMatch(
      /invite-only|by invitation|registration is closed/i,
    );
  });
});
