import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountCard } from "./delete-account-card";

// Everything worth testing here is wiring that only exists once the dialog is open:
// what the confirm button is gated on, that the gentler button really reaches the
// export rather than the delete, and that a delete that succeeded leaves for the one
// screen carrying the purge date. Each of them fails silently in a way a type-checker
// cannot see - a gate comparing the wrong string still compiles, and so does a
// navigation to a page with no date on it.

vi.mock("@/lib/api/users", () => ({
  usersAPI: { deleteAccount: vi.fn() },
}));

vi.mock("@/lib/api/export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/export")>()),
  exportAPI: { download: vi.fn() },
}));

vi.mock("@/lib/download", () => ({
  saveApiDownload: vi.fn(),
}));

vi.mock("@/lib/navigation", () => ({
  hardNavigate: vi.fn(),
}));

vi.mock("@/lib/auth-broadcast", () => ({
  announceSignedOut: vi.fn(),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { usersAPI } = await import("@/lib/api/users");
const { exportAPI } = await import("@/lib/api/export");
const { saveApiDownload } = await import("@/lib/download");
const { hardNavigate } = await import("@/lib/navigation");
const { announceSignedOut } = await import("@/lib/auth-broadcast");

const deleteAccount = vi.mocked(usersAPI.deleteAccount);
const download = vi.mocked(exportAPI.download);
const saveApi = vi.mocked(saveApiDownload);
const save = vi.fn();
const leave = vi.mocked(hardNavigate);
const announce = vi.mocked(announceSignedOut);

beforeEach(() => {
  deleteAccount.mockReset();
  download.mockReset();
  save.mockReset();
  saveApi.mockReset();
  saveApi.mockImplementation(async (_path, fetchFile) => {
    const { blob, filename } = await fetchFile();
    save(blob, filename);
    return 0;
  });
  leave.mockReset();
  announce.mockReset();
  toast.mockReset();
  deleteAccount.mockResolvedValue({
    message: "User deleted",
    purge_after: "2026-09-04T10:00:00Z",
  });
});

const confirmButton = () =>
  screen.getByRole("button", { name: "Delete my account" });

async function openDialog() {
  await userEvent.click(
    screen.getByRole("button", { name: "Delete my account" }),
  );
}

describe("DeleteAccountCard", () => {
  it("counts the dive drafts in both lists of what is erased", async () => {
    render(<DeleteAccountCard username="alex" />);
    expect(screen.getByText(/Deleting locks you out/)).toHaveTextContent(
      /Your dives, dive drafts, dive sites/,
    );

    await openDialog();
    expect(
      screen.getByText(/This erases your whole logbook/),
    ).toHaveTextContent(/every dive and its profile, your dive drafts,/);
  });

  it("keeps the confirm button blocked until the username is typed back", async () => {
    render(<DeleteAccountCard username="alex" />);
    await openDialog();

    expect(confirmButton()).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox"), "ale");
    expect(confirmButton()).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox"), "x");
    expect(confirmButton()).toBeEnabled();
  });

  it("accepts the username however it was capitalized", async () => {
    // The gate is friction, not a password: someone whose keyboard capitalized the
    // first letter has still made the decision it exists to ask for.
    render(<DeleteAccountCard username="alex" />);
    await openDialog();

    await userEvent.type(screen.getByRole("textbox"), " Alex ");

    expect(confirmButton()).toBeEnabled();
  });

  it("deletes and leaves for the goodbye screen with the purge date", async () => {
    render(<DeleteAccountCard username="alex" />);
    await openDialog();
    await userEvent.type(screen.getByRole("textbox"), "alex");

    await userEvent.click(confirmButton());

    await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
    // The date is the whole reason for the redirect - the account is dark by the time
    // that page renders, so a `/goodbye` with nothing on it can never recover it.
    expect(leave).toHaveBeenCalledWith(
      "/goodbye?purge_after=2026-09-04T10%3A00%3A00Z",
    );
    // The account is dark in every tab, so every other tab leaves too.
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("reports a delete that failed and stays put", async () => {
    deleteAccount.mockRejectedValue(new Error("rate limited"));
    render(<DeleteAccountCard username="alex" />);
    await openDialog();
    await userEvent.type(screen.getByRole("textbox"), "alex");

    await userEvent.click(confirmButton());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(leave).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    // Re-armed rather than stuck in its loading state: the account is still there,
    // and so is the decision.
    expect(confirmButton()).toBeEnabled();
  });

  it("will not delete while the archive is still being saved", async () => {
    // The delete ends in a page load, and that takes both the in-flight request and
    // the object URL the browser is reading the saved file out of - so an armed
    // confirm here is the diver losing the copy of their logbook they had just asked
    // for, on an account that is dark by then and cannot be asked twice.
    let release: (value: { blob: Blob; filename: string }) => void = () => {};
    download.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<DeleteAccountCard username="alex" />);
    await openDialog();
    await userEvent.type(screen.getByRole("textbox"), "alex");

    await userEvent.click(
      screen.getByRole("button", { name: "Download my data first" }),
    );
    await waitFor(() => expect(confirmButton()).toBeDisabled());

    release({ blob: new Blob(["bytes"]), filename: "alex-logbook.zip" });

    // Handed to the browser and still blocked: `downloadBlob` returns as soon as it
    // has dispatched the click, not when the file has been written, so the window
    // this guards outlasts the fetch.
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(confirmButton()).toBeDisabled();

    // Verify the gate re-arms so exporting remains available after the cooldown.
    // Real timers let the dialog effects and save cooldown advance together.
    await waitFor(() => expect(confirmButton()).toBeEnabled(), {
      timeout: 4_000,
    });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("holds the confirm while a ticketed download may still be waiting on the archive", async () => {
    // Firefox for iOS: the save is a navigation the server answers only once the
    // archive is built, and a delete would supersede it and end its ticket's
    // session. `saveApiDownload` says how long that can take.
    saveApi.mockResolvedValue(300_000);
    render(<DeleteAccountCard username="alex" />);
    await openDialog();
    await userEvent.type(screen.getByRole("textbox"), "alex");

    await userEvent.click(
      screen.getByRole("button", { name: "Download my data first" }),
    );
    await waitFor(() => expect(saveApi).toHaveBeenCalled());

    // Past the blob path's two-second settle, and still blocked.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Preparing..." }),
    ).toBeInTheDocument();
  });

  it("saves the full archive without deleting anything", async () => {
    const blob = new Blob(["bytes"]);
    download.mockResolvedValue({ blob, filename: "alex-logbook.zip" });
    render(<DeleteAccountCard username="alex" />);
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: "Download my data first" }),
    );

    // The archive specifically: it is the only export carrying the dive-computer
    // files, the card scans and the portrait, which is what makes it the one to offer
    // on the way out.
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith("archive", "alex"),
    );
    expect(saveApi).toHaveBeenCalledWith(
      "/export/archive",
      expect.any(Function),
    );
    expect(save).toHaveBeenCalledWith(blob, "alex-logbook.zip");
    expect(deleteAccount).not.toHaveBeenCalled();
    // Still on the decision it interrupted, rather than closed behind the download.
    expect(confirmButton()).toBeInTheDocument();
  });
});
