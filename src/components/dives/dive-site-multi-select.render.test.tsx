import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteMultiSelect } from "./dive-site-multi-select";

// This field shares `CreatableCombobox` with the trip location picker, and the
// rules about what counts as choosing an item were tightened there - for every
// append-only field, not just that one. Pinned here because the change is
// invisible from the trips tests: typing an exact name used to append the site
// on the keystroke, and blurring used to commit an exact match, and both are
// gone. What is left, and what these assert, is a click or Enter.

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { lookupDiveSites: vi.fn(), getDiveSite: vi.fn() },
}));

// The real dialog's form is beside the point; what matters is that it closes
// through `DialogContent`, whose focus return is what the picker overrides.
vi.mock("@/components/sites/dive-site-dialog", async () => {
  const { Dialog, DialogContent, DialogTitle } =
    await import("@/components/ui/dialog");
  return {
    DiveSiteDialog: ({
      open,
      onOpenChange,
      onSaved,
      onCloseAutoFocus,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSaved: (site: unknown) => void;
      onCloseAutoFocus?: (event: Event) => void;
    }) => (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogTitle>New Dive Site</DialogTitle>
          <button
            type="button"
            onClick={() => {
              onSaved({ uuid: "site-new", name: "Canyon", location: null });
              onOpenChange(false);
            }}
          >
            Save
          </button>
        </DialogContent>
      </Dialog>
    ),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const lookupDiveSites = vi.mocked(diveSitesAPI.lookupDiveSites);
const getDiveSite = vi.mocked(diveSitesAPI.getDiveSite);

const SITE = {
  uuid: "site-1",
  name: "Blue Hole",
  location: { name: "Dahab, Egypt" },
};
const SECOND_SITE = {
  uuid: "site-2",
  name: "Thistlegorm",
  location: { name: "Red Sea, Egypt" },
};

beforeEach(() => {
  getDiveSite.mockReset();
  getDiveSite.mockImplementation(
    async (uuid) =>
      [SITE, SECOND_SITE].find((site) => site.uuid === uuid) as never,
  );
  lookupDiveSites.mockReset();
  lookupDiveSites.mockResolvedValue({
    data: [SITE],
    total_count: 1,
    has_more: false,
    page: 1,
    items_per_page: 25,
  } as never);
});

function Field({ until }: { until?: string }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <DiveSiteMultiSelect value={value} onChange={setValue} until={until} />
  );
}

const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    li.textContent?.trim(),
  );

// The menu's own row, once the open-query has answered.
const openMenu = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /Blue Hole/ })).toBeVisible(),
  );
};

describe("DiveSiteMultiSelect", () => {
  it("asks the lookup for sites ranked at the dive's own date", async () => {
    render(<Field until="2019-06-01" />);
    await openMenu();

    expect(lookupDiveSites).toHaveBeenCalledWith(1, 25, {
      search: "",
      until: "2019-06-01",
    });
  });

  it("adds a site when its row is picked", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(screen.getByRole("option", { name: /Blue Hole/ }));

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
  });

  it("adds a site on Enter", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.paste("Blue Hole");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
  });

  // Most dives have one site, so an add leaves the field shut rather than
  // holding the menu open over the rest of the form for a second.
  const expectFieldLeft = () => {
    expect(screen.getByRole("combobox")).not.toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  };

  it("leaves the field after a site is picked", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(screen.getByRole("option", { name: /Blue Hole/ }));

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
    expectFieldLeft();
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("leaves the field after a site is added on Enter", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.paste("Blue Hole");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
    expectFieldLeft();
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("leaves the field after a site is saved from the new-site dialog", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Add dive site/ }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(rows()).toEqual(["Canyon"]);
    // The focus return runs on a timer after the dialog unmounts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expectFieldLeft();
  });

  it("returns to the field when the new-site dialog is cancelled", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Add dive site/ }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
  });

  it("adds nothing from typing the name alone", async () => {
    // The "Bohol" on the way to "Bohol Sea" case: a name typed on the way to a
    // longer one is not a choice, and this field's `onChange` appends.
    render(<Field />);
    await openMenu();

    await userEvent.paste("Blue Hole");
    await waitFor(() => expect(lookupDiveSites).toHaveBeenCalled());

    expect(rows()).toEqual([]);
  });

  it("says it is searching while the list is loading, not that there is none", async () => {
    // The field's opening query is a real request, and "No dive sites yet." is
    // a claim about the diver's whole catalogue - the worst possible thing to
    // say while still waiting to hear.
    lookupDiveSites.mockReturnValue(new Promise(() => {}) as never);
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText("No dive sites yet.")).not.toBeInTheDocument();
  });

  it("says the search is down when the opening query fails", async () => {
    lookupDiveSites.mockRejectedValue(new Error("500"));
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(
      await screen.findByText("Search is unavailable right now."),
    ).toBeInTheDocument();
  });

  it("names both per-row controls after the site they act on", async () => {
    // Two rows is the smallest list that can prove it: with one, "Remove" and
    // "Remove Blue Hole" are equally unambiguous.
    render(
      <DiveSiteMultiSelect
        value={[SITE.uuid, SECOND_SITE.uuid]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Blue Hole" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Thistlegorm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Reorder Blue Hole, position 1 of 2 \(primary site\)\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Reorder Thistlegorm, position 2 of 2\./,
      }),
    ).toBeInTheDocument();
  });

  it("warns under a site whose water or altitude differs from the first that records one", async () => {
    const records = {
      [SITE.uuid]: { ...SITE, water_type: "salt", altitude: 0 },
      [SECOND_SITE.uuid]: { ...SECOND_SITE, water_type: "fresh", altitude: 0 },
      "site-3": { uuid: "site-3", name: "Tarn", altitude: 2400 },
    };
    getDiveSite.mockImplementation(async (uuid) => records[uuid] as never);
    render(
      <DiveSiteMultiSelect
        value={[SITE.uuid, SECOND_SITE.uuid, "site-3"]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(rows()).toEqual([
        "Blue Hole, Dahab, Egypt",
        "Thistlegorm, Red Sea, EgyptFresh water, unlike Blue Hole (salt water)",
        "TarnAltitude 2400 m, unlike Blue Hole (0 m)",
      ]),
    );
  });

  it("removes the site whose button was pressed", async () => {
    const onChange = vi.fn();
    render(
      <DiveSiteMultiSelect
        value={[SITE.uuid, SECOND_SITE.uuid]}
        knownSites={[SITE, SECOND_SITE]}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Thistlegorm" }),
    );

    expect(onChange).toHaveBeenCalledWith([SITE.uuid]);
  });

  it("adds nothing on the way out of the field", async () => {
    render(
      <>
        <Field />
        <button type="button">Elsewhere</button>
      </>,
    );
    await openMenu();
    await userEvent.paste("Blue Hole");

    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(rows()).toEqual([]);
  });
});
