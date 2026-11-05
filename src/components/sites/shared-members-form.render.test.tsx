import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedMembersForm } from "./shared-members-form";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const MEMBERS: DiveSiteSharedMembers = {
  name: "Coral Garden",
  other_names: ["The Garden"],
  latitude: 27.5,
  longitude: 34.25,
  location_name: "Dahab",
  external_ids: [{ registry: "wikidata", identifier: "Q42" }],
  depth_from: 5,
  depth_to: 30,
  water_type: "salt",
  altitude: null,
  entry_types: ["shore"],
};

const open = (
  props: { members?: DiveSiteSharedMembers; label?: string } = {},
) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Members</DialogTitle>
        <SharedMembersForm
          members={props.members ?? MEMBERS}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          submitLabel={props.label ?? "Send"}
          error={null}
        >
          <p>Asked before the submit</p>
        </SharedMembersForm>
      </DialogContent>
    </Dialog>,
  );
  return onSubmit;
};

const send = () =>
  userEvent.click(screen.getByRole("button", { name: "Send" }));

describe("SharedMembersForm", () => {
  it("hands back what it was given, all eleven members", async () => {
    const onSubmit = open();
    await send();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(MEMBERS));
    expect(Object.keys(onSubmit.mock.calls[0][0])).toHaveLength(11);
  });

  it("names a cleared member rather than leaving it out", async () => {
    const onSubmit = open();
    await userEvent.clear(screen.getByLabelText("Location"));
    await userEvent.click(
      screen.getByRole("button", { name: /Remove Wikidata Q42/ }),
    );
    await send();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...MEMBERS,
        location_name: null,
        external_ids: [],
      }),
    );
  });

  it("offers a registry entry for removal, never for typing", () => {
    open();

    expect(screen.queryByLabelText(/registry|identifier/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Wikidata/ })).toBeInTheDocument();
  });

  // iOS's decimal keypad has no minus, so a southern or western pin could not be typed.
  it("leaves the pin's keyboard able to type a minus", () => {
    open();

    expect(screen.getByLabelText("Latitude")).not.toHaveAttribute("inputmode");
    expect(screen.getByLabelText("Longitude")).not.toHaveAttribute("inputmode");
  });

  it("refuses to clear the pin", async () => {
    const onSubmit = open();
    await userEvent.clear(screen.getByLabelText("Latitude"));
    await userEvent.clear(screen.getByLabelText("Longitude"));
    await send();

    expect(
      await screen.findByText("A Commons site keeps its pin"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("holds nothing of the diver's own, and what the caller adds", () => {
    open();

    expect(screen.queryByText("Tags")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.getByText("Asked before the submit")).toBeInTheDocument();
  });
});
