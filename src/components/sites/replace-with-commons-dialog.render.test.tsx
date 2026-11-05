import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplaceWithCommonsDialog } from "./replace-with-commons-dialog";
import type { DiveSite } from "@/lib/api/dive-sites";

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { replaceDiveSite: vi.fn() },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const replaceDiveSite = vi.mocked(diveSitesAPI.replaceDiveSite);

const SITE: DiveSite = {
  uuid: "site-1",
  name: "Walk Reef",
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};
const RECORD: DiveSite = {
  ...SITE,
  uuid: "commons-1",
  name: "Kapal Polis",
  owner: "opendivingcommons",
};
const TARGET = { uuid: RECORD.uuid, name: RECORD.name };

const open = () => {
  const onReplaced = vi.fn();
  render(
    <ReplaceWithCommonsDialog
      site={SITE}
      target={TARGET}
      onCancel={vi.fn()}
      onReplaced={onReplaced}
    />,
  );
  return onReplaced;
};

const confirm = () =>
  userEvent.click(
    screen.getByRole("button", { name: "Replace with Commons site" }),
  );

beforeEach(() => {
  replaceDiveSite.mockReset();
});

describe("ReplaceWithCommonsDialog", () => {
  it("states what replacing does before it does it", () => {
    open();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Your dives at Walk Reef will name Kapal Polis instead",
    );
    expect(dialog).toHaveTextContent("Walk Reef is then deleted");
    expect(replaceDiveSite).not.toHaveBeenCalled();
  });

  it("hands back the record", async () => {
    replaceDiveSite.mockResolvedValue(RECORD);
    const onReplaced = open();

    await confirm();

    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(RECORD));
    expect(replaceDiveSite).toHaveBeenCalledWith("site-1", "commons-1");
  });

  it("stays open on a refusal", async () => {
    replaceDiveSite.mockRejectedValue(new Error("down"));
    const onReplaced = open();

    await confirm();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/replace the site/),
    );
    expect(onReplaced).not.toHaveBeenCalled();
  });
});
