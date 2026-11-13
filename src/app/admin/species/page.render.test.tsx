import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSpeciesPage from "./page";
import {
  adminAPI,
  type AdminSpecies,
  type AdminSpeciesPhotoCandidate,
  type AdminSpeciesPhotoProposal,
} from "@/lib/api/admin";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin")>();
  return {
    ...actual,
    adminAPI: {
      getSpecies: vi.fn(),
      getSpeciesPhotoCandidates: vi.fn(),
      pinSpeciesPhoto: vi.fn(),
      hideSpeciesPhoto: vi.fn(),
      refetchSpeciesPhoto: vi.fn(),
      countSpeciesWithPhotoProposals: vi.fn(),
      getSpeciesPhotoProposals: vi.fn(),
      acceptSpeciesPhotoProposal: vi.fn(),
      declineSpeciesPhotoProposal: vi.fn(),
    },
  };
});

const getSpecies = vi.mocked(adminAPI.getSpecies);
const getSpeciesPhotoCandidates = vi.mocked(adminAPI.getSpeciesPhotoCandidates);
const pinSpeciesPhoto = vi.mocked(adminAPI.pinSpeciesPhoto);
const hideSpeciesPhoto = vi.mocked(adminAPI.hideSpeciesPhoto);
const refetchSpeciesPhoto = vi.mocked(adminAPI.refetchSpeciesPhoto);
const countProposed = vi.mocked(adminAPI.countSpeciesWithPhotoProposals);
const getProposals = vi.mocked(adminAPI.getSpeciesPhotoProposals);
const acceptProposal = vi.mocked(adminAPI.acceptSpeciesPhotoProposal);
const declineProposal = vi.mocked(adminAPI.declineSpeciesPhotoProposal);

const QUEENFISH = "01a073b4-2235-7b48-8ee7-68d0d99b9808";

const species = (overrides: Partial<AdminSpecies> = {}): AdminSpecies => ({
  uuid: QUEENFISH,
  scientific_name: "Seriphus politus",
  common_name: "Queenfish",
  rank: "Species",
  photo_sha256: "a".repeat(64),
  aphia_id: 282761,
  authority: null,
  status: "accepted",
  kingdom: null,
  phylum: null,
  class_name: null,
  order_name: null,
  family: null,
  genus: "Seriphus",
  is_marine: true,
  is_brackish: null,
  is_freshwater: null,
  wikidata_qid: "Q1796044",
  created_at: "2026-10-01T10:00:00+00:00",
  photo_file: "Seriphus politus Mspc094.jpg",
  photo_author: "Someone",
  photo_license: "CC BY-SA 4.0",
  photo_license_url: null,
  photo_source_url:
    "https://commons.wikimedia.org/wiki/File:Seriphus_politus_Mspc094.jpg",
  photo_fetched_at: "2026-10-01T10:00:01+00:00",
  photo_curation: null,
  photo_width: 600,
  photo_height: 400,
  photo_proposals_waiting: 0,
  ...overrides,
});

const page = (rows: AdminSpecies[]) => ({
  data: rows,
  total_count: rows.length,
  has_more: false,
  page: 1,
  items_per_page: 24,
});

const candidate = (
  overrides: Partial<AdminSpeciesPhotoCandidate> = {},
): AdminSpeciesPhotoCandidate => ({
  file: "Seriphus politus 28977555.jpg",
  width: 1200,
  height: 800,
  license: "CC BY 4.0",
  author: "A diver",
  source_url: null,
  preview: "data:image/jpeg;base64,AAAA",
  is_current: false,
  ...overrides,
});

const HIDDEN = species({
  photo_sha256: null,
  photo_curation: "hidden",
  photo_width: null,
  photo_height: null,
  photo_source_url: null,
});

const proposal = (
  overrides: Partial<AdminSpeciesPhotoProposal> = {},
): AdminSpeciesPhotoProposal => ({
  uuid: "01a073b4-0000-7b48-8ee7-000000000001",
  file: "Seriphus politus 28977555.jpg",
  note: "The whole fish, side on, in open water.",
  proposer_name: "Rating script",
  created_at: "2026-11-13T10:00:00+00:00",
  width: 1200,
  height: 800,
  license: "CC BY 4.0",
  author: "A diver",
  source_url: null,
  preview: "data:image/jpeg;base64,BBBB",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  countProposed.mockResolvedValue(0);
  getProposals.mockResolvedValue([]);
  getSpecies.mockImplementation(async () => page([species()]));
  getSpeciesPhotoCandidates.mockResolvedValue({
    category: "Seriphus politus",
    candidates: [
      candidate({ file: "Seriphus politus Mspc094.jpg", is_current: true }),
      candidate({ preview: null }),
    ],
  });
});

const card = async () =>
  within(await screen.findByRole("article", { name: "Queenfish" }));

describe("the species catalog", () => {
  it("asks for the newest page of twenty-four, unfiltered", async () => {
    render(<AdminSpeciesPage />);
    await card();

    expect(getSpecies).toHaveBeenCalledTimes(1);
    expect(getSpecies).toHaveBeenCalledWith(1, 24, {
      search: undefined,
      filter: undefined,
    });
  });

  it("links the species page, its Wikidata item and its Commons file", async () => {
    render(<AdminSpeciesPage />);
    const row = await card();

    expect(row.getByRole("link", { name: "Queenfish" })).toHaveAttribute(
      "href",
      `/species/${QUEENFISH}`,
    );
    expect(row.getByRole("link", { name: "Wikidata" })).toHaveAttribute(
      "href",
      "https://www.wikidata.org/wiki/Q1796044",
    );
    expect(row.getByRole("link", { name: "Commons" })).toHaveAttribute(
      "href",
      species().photo_source_url,
    );
  });

  it("shows no Wikidata link for a species without an item", async () => {
    getSpecies.mockImplementation(async () =>
      page([species({ wikidata_qid: null })]),
    );
    render(<AdminSpeciesPage />);

    expect(
      (await card()).queryByRole("link", { name: "Wikidata" }),
    ).not.toBeInTheDocument();
  });

  it("badges a pinned photo under the floor with both", async () => {
    getSpecies.mockImplementation(async () =>
      page([species({ photo_curation: "pinned", photo_width: 282 })]),
    );
    render(<AdminSpeciesPage />);
    const row = await card();

    expect(row.getByText("Pinned")).toBeInTheDocument();
    expect(row.getByText("Below 500 px")).toBeInTheDocument();
  });

  it("reloads from the first page with the chip that was pressed", async () => {
    render(<AdminSpeciesPage />);
    await card();

    await userEvent.click(screen.getByRole("button", { name: "Below 500 px" }));

    await waitFor(() =>
      expect(getSpecies).toHaveBeenLastCalledWith(1, 24, {
        search: undefined,
        filter: "narrow",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Below 500 px" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reloads from the first page with the search term", async () => {
    render(<AdminSpeciesPage />);
    await card();

    await userEvent.type(
      screen.getAllByLabelText("Search the catalog by name")[0],
      "queen",
    );

    await waitFor(() =>
      expect(getSpecies).toHaveBeenLastCalledWith(1, 24, {
        search: "queen",
        filter: undefined,
      }),
    );
  });
});

describe("hiding a photo", () => {
  it("asks first, then flips the card without reading the list again", async () => {
    hideSpeciesPhoto.mockResolvedValue(HIDDEN);
    render(<AdminSpeciesPage />);

    await userEvent.click((await card()).getByRole("button", { name: /Hide/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Queenfish");
    expect(hideSpeciesPhoto).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Hide" }));

    await waitFor(() =>
      expect(hideSpeciesPhoto).toHaveBeenCalledWith(QUEENFISH),
    );
    expect(await (await card()).findByText("Hidden")).toBeInTheDocument();
    expect(getSpecies).toHaveBeenCalledTimes(1);
  });
});

describe("replacing a photo", () => {
  const openPicker = async () => {
    render(<AdminSpeciesPage />);
    await userEvent.click(
      (await card()).getByRole("button", { name: /Replace/ }),
    );
    return within(await screen.findByRole("dialog"));
  };

  it("offers the candidates, the current one marked, a missing preview still pickable", async () => {
    const dialog = await openPicker();

    expect(getSpeciesPhotoCandidates).toHaveBeenCalledWith(QUEENFISH);
    const current = await dialog.findByRole("button", {
      name: "Use Seriphus politus Mspc094.jpg",
    });
    expect(current).toHaveTextContent("Current");
    expect(current.querySelector("img")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,AAAA",
    );

    const bare = dialog.getByRole("button", {
      name: "Use Seriphus politus 28977555.jpg",
    });
    expect(bare.querySelector("img")).toBeNull();
    expect(bare).toBeEnabled();
    expect(bare).toHaveTextContent("1200 × 800 px");
  });

  it("pins a picked candidate and puts the answer in place", async () => {
    pinSpeciesPhoto.mockResolvedValue(species({ photo_curation: "pinned" }));
    const dialog = await openPicker();

    await userEvent.click(
      await dialog.findByRole("button", {
        name: "Use Seriphus politus 28977555.jpg",
      }),
    );

    await waitFor(() =>
      expect(pinSpeciesPhoto).toHaveBeenCalledWith(
        QUEENFISH,
        "Seriphus politus 28977555.jpg",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect((await card()).getByText("Pinned")).toBeInTheDocument();
    expect(getSpecies).toHaveBeenCalledTimes(1);
  });

  it("pins a pasted URL as it was typed", async () => {
    pinSpeciesPhoto.mockResolvedValue(species({ photo_curation: "pinned" }));
    const dialog = await openPicker();
    const url =
      "https://commons.wikimedia.org/wiki/File:Seriphus_politus_28977555.jpg";

    await userEvent.type(
      dialog.getByLabelText("Commons file title or URL"),
      url,
    );
    await userEvent.click(dialog.getByRole("button", { name: "Use" }));

    await waitFor(() =>
      expect(pinSpeciesPhoto).toHaveBeenCalledWith(QUEENFISH, url),
    );
  });

  it("toasts the API's refusal and keeps the dialog open", async () => {
    pinSpeciesPhoto.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: "That is not the title of a photograph." },
      },
    });
    const dialog = await openPicker();

    await userEvent.type(
      dialog.getByLabelText("Commons file title or URL"),
      "not a file",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Use" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "That is not the title of a photograph.",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("re-fetching a photo", () => {
  it("is one click on a row the rule decides", async () => {
    refetchSpeciesPhoto.mockResolvedValue(species());
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await card()).getByRole("button", { name: /Re-fetch/ }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(refetchSpeciesPhoto).toHaveBeenCalledWith(QUEENFISH),
    );
  });

  it("asks first on a pinned row, saying the pin is dropped", async () => {
    getSpecies.mockImplementation(async () =>
      page([species({ photo_curation: "pinned" })]),
    );
    refetchSpeciesPhoto.mockResolvedValue(
      species({ photo_sha256: null, photo_width: null, photo_height: null }),
    );
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await card()).getByRole("button", { name: /Re-fetch/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("The pin on Queenfish is dropped");
    expect(refetchSpeciesPhoto).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Re-fetch" }),
    );

    await waitFor(() =>
      expect(refetchSpeciesPhoto).toHaveBeenCalledWith(QUEENFISH),
    );
    expect(await (await card()).findByText("No photo")).toBeInTheDocument();
  });

  it("reads a 503 as nothing having changed, whatever the body says", async () => {
    refetchSpeciesPhoto.mockRejectedValue({ response: { status: 503 } });
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await card()).getByRole("button", { name: /Re-fetch/ }),
    );

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "The photo could not be fetched; nothing changed.",
          variant: "destructive",
        }),
      ),
    );
  });
});

describe("photo proposals", () => {
  const WAITING = species({ photo_proposals_waiting: 1 });
  const PINNED = species({
    photo_curation: "pinned",
    photo_sha256: "b".repeat(64),
    photo_proposals_waiting: 0,
  });

  const showWaiting = (rows: AdminSpecies[] = [WAITING]) =>
    getSpecies.mockImplementation(async () => page(rows));

  const tile = async () =>
    within(
      await (
        await card()
      ).findByRole("listitem", { name: "Proposed by Rating script" }),
    );

  it("counts the species with one waiting on the Proposed chip, and filters by it", async () => {
    countProposed.mockResolvedValue(3);
    render(<AdminSpeciesPage />);

    const chip = await screen.findByRole("button", { name: "Proposed 3" });
    await userEvent.click(chip);

    await waitFor(() =>
      expect(getSpecies).toHaveBeenLastCalledWith(1, 24, {
        search: undefined,
        filter: "proposed",
      }),
    );
  });

  it("asks nothing for a species with none waiting", async () => {
    render(<AdminSpeciesPage />);
    await card();

    expect(getProposals).not.toHaveBeenCalled();
    expect(
      (await card()).queryByRole("region", { name: "Photo proposals" }),
    ).not.toBeInTheDocument();
  });

  it("shows each beside the current photo, with who, why, the credit and both buttons", async () => {
    showWaiting();
    getProposals.mockResolvedValue([proposal()]);
    render(<AdminSpeciesPage />);

    const row = await tile();
    expect(getProposals).toHaveBeenCalledWith(QUEENFISH);
    const images = [
      ...(await tile())
        .getByRole("button", { name: "Accept" })
        .closest("li")!
        .querySelectorAll("img"),
    ];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      expect.stringContaining(QUEENFISH),
      "data:image/jpeg;base64,BBBB",
    ]);
    expect(row.getByText(/Rating script/)).toBeInTheDocument();
    expect(
      row.getByText("The whole fish, side on, in open water."),
    ).toBeInTheDocument();
    expect(row.getByText("CC BY 4.0 · A diver")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(row.getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  it("keeps the card and both buttons where Wikimedia gave nothing", async () => {
    showWaiting();
    getProposals.mockResolvedValue([
      proposal({ preview: null, license: null, author: null, width: null }),
    ]);
    render(<AdminSpeciesPage />);

    const row = await tile();
    expect(row.getByText("Proposed")).toBeInTheDocument();
    expect([
      ...(await tile())
        .getByRole("button", { name: "Accept" })
        .closest("li")!
        .querySelectorAll("img"),
    ]).toHaveLength(1);
    expect(row.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(row.getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  it("reads one species' proposals at a time", async () => {
    const LIONFISH = "01a073b4-2235-7b48-8ee7-000000000002";
    showWaiting([
      WAITING,
      species({
        uuid: LIONFISH,
        common_name: "Lionfish",
        photo_proposals_waiting: 2,
      }),
    ]);
    let answer!: (proposals: AdminSpeciesPhotoProposal[]) => void;
    getProposals.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    render(<AdminSpeciesPage />);
    await card();

    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getProposals).toHaveBeenCalledTimes(1);
    expect(getProposals).toHaveBeenCalledWith(QUEENFISH);

    answer([proposal()]);

    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2));
    expect(getProposals).toHaveBeenLastCalledWith(LIONFISH);
  });

  it("accepting puts the pinned row in place, drops the proposals and counts again", async () => {
    showWaiting();
    getProposals.mockResolvedValue([proposal()]);
    countProposed.mockResolvedValueOnce(1).mockResolvedValue(0);
    acceptProposal.mockResolvedValue(PINNED);
    render(<AdminSpeciesPage />);
    await screen.findByRole("button", { name: "Proposed 1" });

    await userEvent.click(
      (await tile()).getByRole("button", { name: "Accept" }),
    );

    await waitFor(() =>
      expect(acceptProposal).toHaveBeenCalledWith(proposal().uuid),
    );
    const row = await card();
    expect(await row.findByText("Pinned")).toBeInTheDocument();
    expect(
      row.queryByRole("region", { name: "Photo proposals" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Proposed 0" }),
    ).toBeInTheDocument();
    expect(getSpecies).toHaveBeenCalledTimes(1);
  });

  it.each([422, 503])(
    "a %i on accepting says why and leaves the proposal on the card",
    async (status) => {
      showWaiting();
      getProposals.mockResolvedValue([proposal()]);
      acceptProposal.mockRejectedValue({
        response: { status, data: { detail: "Commons has no such file." } },
      });
      render(<AdminSpeciesPage />);

      await userEvent.click(
        (await tile()).getByRole("button", { name: "Accept" }),
      );

      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      );
      expect(
        (await tile()).getByRole("button", { name: "Accept" }),
      ).toBeEnabled();
      expect(getProposals).toHaveBeenCalledTimes(1);
      expect(countProposed).toHaveBeenCalledTimes(1);
    },
  );

  it.each([404, 409])(
    "a %i on accepting or declining reads the proposals and the count again",
    async (status) => {
      showWaiting();
      getProposals.mockResolvedValueOnce([proposal()]).mockResolvedValue([]);
      acceptProposal.mockRejectedValue({
        response: { status, data: { detail: "That proposal is gone." } },
      });
      render(<AdminSpeciesPage />);

      await userEvent.click(
        (await tile()).getByRole("button", { name: "Accept" }),
      );

      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({ description: "That proposal is gone." }),
        ),
      );
      await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2));
      expect(countProposed).toHaveBeenCalledTimes(2);
      expect(
        await (await card()).findByText("No proposal waits any more."),
      ).toBeInTheDocument();
    },
  );

  it("a 409 on declining reads them again too", async () => {
    showWaiting();
    getProposals.mockResolvedValueOnce([proposal()]).mockResolvedValue([]);
    declineProposal.mockRejectedValue({
      response: { status: 409, data: { detail: "Already decided." } },
    });
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await tile()).getByRole("button", { name: "Decline" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2));
    expect(countProposed).toHaveBeenCalledTimes(2);
  });

  it("declining sends the reason, puts the row in place and reads what still waits", async () => {
    showWaiting([species({ photo_proposals_waiting: 2 })]);
    const second = proposal({
      uuid: "01a073b4-0000-7b48-8ee7-000000000002",
      file: "Seriphus politus 2.jpg",
      proposer_name: "Another account",
    });
    getProposals
      .mockResolvedValueOnce([proposal(), second])
      .mockResolvedValue([second]);
    declineProposal.mockResolvedValue(species({ photo_proposals_waiting: 1 }));
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await tile()).getByRole("button", { name: "Decline" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Reason (optional)"),
      " A different fish. ",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(declineProposal).toHaveBeenCalledWith(
        proposal().uuid,
        "A different fish.",
      ),
    );
    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2));
    const row = await card();
    expect(
      await row.findByRole("listitem", { name: "Proposed by Another account" }),
    ).toBeInTheDocument();
    expect(
      row.queryByRole("listitem", { name: "Proposed by Rating script" }),
    ).not.toBeInTheDocument();
    expect(countProposed).toHaveBeenCalledTimes(2);
  });

  it("declines with no reason at all", async () => {
    showWaiting();
    getProposals.mockResolvedValue([proposal()]);
    declineProposal.mockResolvedValue(species());
    render(<AdminSpeciesPage />);

    await userEvent.click(
      (await tile()).getByRole("button", { name: "Decline" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(declineProposal).toHaveBeenCalledWith(proposal().uuid, ""),
    );
  });

  it("a hide leaves no proposal on the card and counts again", async () => {
    showWaiting();
    getProposals.mockResolvedValue([proposal()]);
    hideSpeciesPhoto.mockResolvedValue({
      ...HIDDEN,
      photo_proposals_waiting: 0,
    });
    render(<AdminSpeciesPage />);
    await tile();

    await userEvent.click((await card()).getByRole("button", { name: /Hide/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Hide" }));

    const row = await card();
    expect(await row.findByText("Hidden")).toBeInTheDocument();
    expect(
      row.queryByRole("region", { name: "Photo proposals" }),
    ).not.toBeInTheDocument();
    expect(countProposed).toHaveBeenCalledTimes(2);
  });
});
