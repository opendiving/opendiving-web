import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddedYou } from "./added-you";

const mocks = vi.hoisted(() => ({
  getAddedYou: vi.fn(),
  hideAddedYou: vi.fn(),
  disconnectAddedYou: vi.fn(),
  updatePerson: vi.fn(),
  createPerson: vi.fn(),
  getPerson: vi.fn(),
  fetchAllPeople: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    getAddedYou: mocks.getAddedYou,
    hideAddedYou: mocks.hideAddedYou,
    disconnectAddedYou: mocks.disconnectAddedYou,
    updatePerson: mocks.updatePerson,
    createPerson: mocks.createPerson,
    getPerson: mocks.getPerson,
    getAddedYouPictureBlob: vi.fn(),
  },
  fetchAllPeople: mocks.fetchAllPeople,
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const ROBIN = {
  uuid: "account-1",
  name: "Robin Reef",
  username: "robin",
  avatar_sha256: null,
};
const SAM = {
  uuid: "account-2",
  name: "Sam Diver",
  username: "samd",
  avatar_sha256: null,
};

const page = (data: unknown[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 50,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getAddedYou.mockResolvedValue(page([ROBIN, SAM]));
  mocks.hideAddedYou.mockResolvedValue({ message: "Hidden" });
  mocks.disconnectAddedYou.mockResolvedValue({ message: "Disconnected" });
  mocks.fetchAllPeople.mockResolvedValue([]);
  mocks.createPerson.mockResolvedValue({
    uuid: "person-new",
    name: "Robin Reef",
    username: "robin",
  });
});

const row = (name: string) => screen.getByText(name).closest("li")!;

describe("AddedYou", () => {
  it("lists who added you, by name and username, under what they see", async () => {
    render(<AddedYou onAdded={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Added you" }),
    ).toBeInTheDocument();
    expect(row("Robin Reef")).toHaveTextContent("@robin");
    expect(row("Sam Diver")).toHaveTextContent("@samd");
    expect(screen.getByText(/see your picture and\s+username/)).toBeVisible();
  });

  it("is absent while it loads and where nobody added you", async () => {
    let answer!: (value: unknown) => void;
    mocks.getAddedYou.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const { container } = render(<AddedYou onAdded={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    answer(page([]));
    await waitFor(() => expect(mocks.getAddedYou).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("adds a diver back through the form headed by them", async () => {
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(<AddedYou onAdded={onAdded} />);

    await screen.findByText("Robin Reef");
    await user.click(
      within(row("Robin Reef")).getByRole("button", { name: "Add" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add to your people",
    });
    expect(dialog).toHaveTextContent("@robin");
    await user.click(
      within(dialog).getByRole("button", { name: "Add to your people" }),
    );

    await waitFor(() =>
      expect(mocks.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Robin Reef",
          connect_account: "account-1",
        }),
      ),
    );
    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: "person-new" }),
      ),
    );
    expect(screen.queryByText("@robin")).toBeNull();
    expect(screen.getByText("Sam Diver")).toBeInTheDocument();
  });

  it("hides a row, and changes nothing else", async () => {
    const user = userEvent.setup();
    render(<AddedYou onAdded={vi.fn()} />);

    await screen.findByText("Sam Diver");
    await user.click(
      within(row("Sam Diver")).getByRole("button", { name: "Hide" }),
    );

    await waitFor(() => expect(screen.queryByText("Sam Diver")).toBeNull());
    expect(mocks.hideAddedYou).toHaveBeenCalledWith("account-2");
    expect(mocks.disconnectAddedYou).not.toHaveBeenCalled();
  });

  it("disconnects only after a confirmation that says what it does", async () => {
    const user = userEvent.setup();
    render(<AddedYou onAdded={vi.fn()} />);

    await screen.findByText("Sam Diver");
    await user.click(
      within(row("Sam Diver")).getByRole("button", { name: "Disconnect" }),
    );
    expect(mocks.disconnectAddedYou).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Disconnect" });
    expect(dialog).toHaveTextContent(
      /Sam Diver keeps you in their people by name, without your picture or username, and is not told\. They can connect again with your connect link until you reset it\./,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() =>
      expect(mocks.disconnectAddedYou).toHaveBeenCalledWith("account-2"),
    );
    await waitFor(() => expect(screen.queryByText("Sam Diver")).toBeNull());
  });

  it("keeps the row and says so where an action fails", async () => {
    mocks.hideAddedYou.mockRejectedValue({
      response: { status: 404, data: { detail: "No such tie." } },
    });
    const user = userEvent.setup();
    render(<AddedYou onAdded={vi.fn()} />);

    await screen.findByText("Sam Diver");
    await user.click(
      within(row("Sam Diver")).getByRole("button", { name: "Hide" }),
    );

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "No such tie.",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByText("Sam Diver")).toBeInTheDocument();
  });
});
