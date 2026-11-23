import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectPage } from "./connect-page";
import { metadata } from "@/app/connect/[token]/page";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  resolve: vi.fn(),
  resolveForYou: vi.fn(),
  createPerson: vi.fn(),
  fetchAllPeople: vi.fn(),
  landing: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/api/connect-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/connect-links")>()),
  connectLinksAPI: {
    resolve: mocks.resolve,
    resolveForYou: mocks.resolveForYou,
    getOwnerPictureBlob: vi.fn(),
  },
}));
vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: { createPerson: mocks.createPerson },
  fetchAllPeople: mocks.fetchAllPeople,
}));
// The landing page has its own tests; what matters here is which door it is
// handed, and that it is handed nothing for a dead link.
vi.mock("@/components/layout/landing-page", () => ({
  LandingPage: (props: unknown) => {
    mocks.landing(props);
    return <div>landing page</div>;
  },
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const OWNER = {
  name: "Sam Diver",
  username: "samd",
  avatar_sha256: null,
  is_yours: false,
  person_uuid: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth = { isAuthenticated: false, isLoading: false };
  mocks.resolve.mockResolvedValue({ name: "Sam Diver", avatar_sha256: "abc" });
  mocks.resolveForYou.mockResolvedValue(OWNER);
  mocks.fetchAllPeople.mockResolvedValue([]);
  mocks.createPerson.mockResolvedValue({ uuid: "person-new", name: "Sam" });
});

const signedIn = () => {
  mocks.auth = { isAuthenticated: true, isLoading: false };
};

describe("the connect route", () => {
  // A link is one diver's, handed to one person.
  it("is not indexed and names no canonical of its own", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });
});

describe("ConnectPage signed out", () => {
  it("reads the anonymous route and hands the landing page the link", async () => {
    render(<ConnectPage token={TOKEN} />);

    await screen.findByText("landing page");
    expect(mocks.resolve).toHaveBeenCalledWith(TOKEN);
    expect(mocks.resolveForYou).not.toHaveBeenCalled();
    expect(mocks.landing).toHaveBeenLastCalledWith({
      connectLink: { token: TOKEN, ownerName: "Sam Diver", avatarSha: "abc" },
    });
  });

  it.each([
    ["a dead link", null],
    ["an API that did not answer", new Error("Network Error")],
  ])("is the landing page as it is for %s", async (_label, answer) => {
    if (answer instanceof Error) mocks.resolve.mockRejectedValue(answer);
    else mocks.resolve.mockResolvedValue(answer);

    render(<ConnectPage token={TOKEN} />);

    await screen.findByText("landing page");
    expect(mocks.landing).toHaveBeenLastCalledWith({});
  });

  it("asks nothing while the session is unknown", () => {
    mocks.auth = { isAuthenticated: false, isLoading: true };

    render(<ConnectPage token={TOKEN} />);

    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.resolveForYou).not.toHaveBeenCalled();
  });
});

describe("ConnectPage signed in", () => {
  it("opens the form headed by the owner, and saves the connection", async () => {
    signedIn();
    const user = userEvent.setup();

    render(<ConnectPage token={TOKEN} />);

    const dialog = await screen.findByRole("dialog", {
      name: "Add to your people",
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("@samd");
    expect(screen.getByLabelText("Name *")).toHaveValue("Sam Diver");
    expect(dialog).toHaveTextContent(
      "Sam Diver will see your name, username and picture",
    );

    await user.click(
      screen.getByRole("button", { name: "Add to your people" }),
    );

    await waitFor(() =>
      expect(mocks.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Sam Diver", connect_link: TOKEN }),
      ),
    );
    expect(mocks.createPerson.mock.calls[0][0]).not.toHaveProperty("username");
    expect(
      await screen.findByRole("heading", {
        name: "Sam Diver is in your people",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Go to Sam Diver/ }),
    ).toHaveAttribute("href", "/people/person-new");
  });

  it("says the owner is already in your people, with the way to them", async () => {
    signedIn();
    mocks.resolveForYou.mockResolvedValue({
      ...OWNER,
      person_uuid: "person-1",
    });

    render(<ConnectPage token={TOKEN} />);

    expect(
      await screen.findByRole("heading", {
        name: "Sam Diver is in your people",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Go to Sam Diver/ }),
    ).toHaveAttribute("href", "/people/person-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says a link is the diver's own, with the way to its pane", async () => {
    signedIn();
    mocks.resolveForYou.mockResolvedValue({ ...OWNER, is_yours: true });

    render(<ConnectPage token={TOKEN} />);

    expect(
      await screen.findByRole("heading", {
        name: "This is your own connect link",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open your connect link" }),
    ).toHaveAttribute("href", "/people?show=connect-link");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a dead link with no form and no sign-in", async () => {
    signedIn();
    mocks.resolveForYou.mockResolvedValue(null);

    render(<ConnectPage token={TOKEN} />);

    expect(
      await screen.findByRole("heading", {
        name: "This connect link is no longer active",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("landing page")).toBeNull();
  });
});
