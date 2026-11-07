import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteProposalFlow } from "./site-proposal-flow";
import type { DiveSite } from "@/lib/api/dive-sites";

const SITE: DiveSite = {
  uuid: "site-1",
  name: "Walk Reef",
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};
const SAVED: DiveSite = { ...SITE, name: "Walk Reef North" };
const RECORD: DiveSite = { ...SITE, uuid: "commons-1", name: "Kapal Polis" };

vi.mock("@/components/sites/propose-site-dialog", () => ({
  ProposeSiteDialog: ({
    open,
    onOpenChange,
    site,
    onReplace,
    onEdit,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    site: DiveSite;
    onReplace: (match: { uuid: string; name: string }) => void;
    onEdit: () => void;
  }) =>
    open ? (
      <>
        <p>Steps of {site.name}</p>
        <button onClick={() => onOpenChange(false)}>Cancel the steps</button>
        <button onClick={onEdit}>Edit</button>
        <button onClick={() => onReplace({ uuid: "commons-1", name: "K" })}>
          Replace
        </button>
      </>
    ) : null,
}));
vi.mock("@/components/sites/dive-site-dialog", () => ({
  // Closing after the save, as the real one does.
  DiveSiteDialog: ({
    open,
    onOpenChange,
    onSaved,
    offersChoice,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (site: DiveSite, proposes: boolean) => void;
    offersChoice: boolean;
  }) =>
    open ? (
      <>
        <p>The form, {offersChoice ? "with" : "without"} the choice</p>
        <button
          onClick={() => {
            onSaved(SAVED, false);
            onOpenChange(false);
          }}
        >
          Save
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel the form</button>
      </>
    ) : null,
}));
vi.mock("@/components/sites/replace-with-commons-dialog", () => ({
  ReplaceWithCommonsDialog: ({
    target,
    onCancel,
    onReplaced,
  }: {
    target: object | null;
    onCancel: () => void;
    onReplaced: (record: DiveSite) => void;
  }) =>
    target ? (
      <>
        <button onClick={onCancel}>Cancel the replace</button>
        <button onClick={() => onReplaced(RECORD)}>Confirm</button>
      </>
    ) : null,
}));

const onReplaced = vi.fn();

function Host() {
  const [site, setSite] = useState<DiveSite | null>(SITE);
  return (
    <>
      <p>{site ? "Flow open" : "Flow closed"}</p>
      <SiteProposalFlow
        site={site}
        onClose={() => setSite(null)}
        onSaved={setSite}
        onReplaced={onReplaced}
      />
    </>
  );
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => onReplaced.mockReset());

describe("SiteProposalFlow", () => {
  it("draws nothing without a site", () => {
    render(
      <SiteProposalFlow
        site={null}
        onClose={() => {}}
        onSaved={() => {}}
        onReplaced={() => {}}
      />,
    );
    expect(screen.queryByText(/Steps of/)).not.toBeInTheDocument();
  });

  it("Edit leaves the steps for the form, which offers no choice", async () => {
    render(<Host />);
    await click("Edit");

    expect(screen.queryByText(/Steps of/)).not.toBeInTheDocument();
    expect(
      screen.getByText("The form, without the choice"),
    ).toBeInTheDocument();
  });

  it("starts the steps again for the saved site", async () => {
    render(<Host />);
    await click("Edit");
    await click("Save");

    expect(screen.getByText("Steps of Walk Reef North")).toBeInTheDocument();
    expect(screen.getByText("Flow open")).toBeInTheDocument();
  });

  it.each([
    ["the steps", ["Cancel the steps"]],
    ["the form", ["Edit", "Cancel the form"]],
    ["the replace", ["Replace", "Cancel the replace"]],
  ])("ends on a cancel of %s", async (_label, buttons) => {
    render(<Host />);
    for (const name of buttons) await click(name);

    expect(screen.getByText("Flow closed")).toBeInTheDocument();
    expect(screen.queryByText(/Steps of/)).not.toBeInTheDocument();
  });

  it("hands a replace's record to the host, and ends", async () => {
    render(<Host />);
    await click("Replace");
    await click("Confirm");

    expect(onReplaced).toHaveBeenCalledWith(RECORD);
    expect(screen.getByText("Flow closed")).toBeInTheDocument();
  });
});
