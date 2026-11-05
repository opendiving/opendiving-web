import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProposeChangeDialog } from "./propose-change-dialog";
import { COMMONS_ATTESTATIONS, type DiveSite } from "@/lib/api/dive-sites";

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { proposeDiveSite: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const proposeDiveSite = vi.mocked(diveSitesAPI.proposeDiveSite);

const RECORD: DiveSite = {
  uuid: "commons-1",
  name: "Kapal Polis",
  latitude: -8.27,
  longitude: 115.59,
  location: { name: "Bali" },
  owner: "opendivingcommons",
  saved: false,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};

const open = () => {
  const onProposed = vi.fn();
  render(
    <ProposeChangeDialog
      open
      onOpenChange={vi.fn()}
      site={RECORD}
      onProposed={onProposed}
    />,
  );
  return onProposed;
};

const tickAndSend = async () => {
  await userEvent.click(
    screen.getByRole("checkbox", { name: COMMONS_ATTESTATIONS.change }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Send proposal" }));
};

beforeEach(() => {
  proposeDiveSite.mockReset();
  proposeDiveSite.mockResolvedValue({
    uuid: "proposal-1",
    kind: "change",
    status: "waiting",
    reason: null,
    site: { uuid: RECORD.uuid, name: RECORD.name },
    created_at: "2026-01-02T00:00:00Z",
    decided_at: null,
  });
});

describe("ProposeChangeDialog", () => {
  it("holds the send until the attestation is ticked", () => {
    open();

    expect(
      screen.getByRole("button", { name: "Send proposal" }),
    ).toBeDisabled();
  });

  it("sends the members that changed and no others", async () => {
    const onProposed = open();

    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Kapal Polisi");
    await tickAndSend();

    await waitFor(() =>
      expect(proposeDiveSite).toHaveBeenCalledWith(RECORD.uuid, {
        attestation: COMMONS_ATTESTATIONS.change,
        message: "",
        members: { name: "Kapal Polisi" },
      }),
    );
    await waitFor(() => expect(onProposed).toHaveBeenCalled());
  });

  it("says a change that changes nothing does, without asking the API", async () => {
    const onProposed = open();
    await tickAndSend();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/changes nothing/),
    );
    expect(proposeDiveSite).not.toHaveBeenCalled();
    expect(onProposed).not.toHaveBeenCalled();
  });
});
