import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonDialog } from "./person-dialog";
import { PersonCombobox } from "./person-combobox";
import type { Person } from "@/lib/api/people";
import type { ConnectTarget } from "./connected-account-head";

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    createPerson: vi.fn(),
    updatePerson: vi.fn(),
    getPeople: vi.fn(),
    getPerson: vi.fn(),
    getPersonPictureBlob: vi.fn(),
    getAddedYouPictureBlob: vi.fn(),
  },
  fetchAllPeople: vi.fn(),
}));

const { peopleAPI, fetchAllPeople } = await import("@/lib/api/people");
const createPerson = vi.mocked(peopleAPI.createPerson);
const updatePerson = vi.mocked(peopleAPI.updatePerson);
const getPeople = vi.mocked(peopleAPI.getPeople);
const getPerson = vi.mocked(peopleAPI.getPerson);
const allPeople = vi.mocked(fetchAllPeople);

const EXISTING: Person = {
  uuid: "person-1",
  name: "Alex M.",
  email: "alex@example.com",
  phone: "+44 7700 900111",
  notes: "Rescue diver, dives a drysuit.",
  username: "alexm",
  avatar_sha256: null,
  dive_count: 12,
  created_at: "2026-03-01T09:00:00Z",
};

// One of the diver's people, logged by name and connected to nobody.
const LOGGED: Person = {
  ...EXISTING,
  uuid: "person-2",
  name: "Sam Diver",
  email: null,
  phone: null,
  notes: "",
  username: null,
};

const BY_LINK: ConnectTarget = {
  via: "link",
  token: "0123456789abcdef0123456789abcdef",
  name: "Sam Diver",
  username: "samd",
  avatarSha: null,
};

const BY_ACCOUNT: ConnectTarget = {
  via: "account",
  uuid: "account-1",
  name: "Robin Reef",
  username: "robin",
  avatarSha: null,
};

// FastAPI's own 422 for a refusal the API makes on one body field.
const refusedOn = (member: string, msg: string) => ({
  response: {
    status: 422,
    data: {
      detail: [{ type: "value_error", loc: ["body", member], msg, input: "x" }],
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  createPerson.mockImplementation(async (body) => ({
    ...EXISTING,
    ...body,
    uuid: "person-new",
    notes: body.notes ?? "",
    dive_count: 0,
  }));
  updatePerson.mockResolvedValue({ message: "Person updated" });
  getPeople.mockResolvedValue({
    data: [EXISTING],
    total_count: 1,
    has_more: false,
    page: 1,
    items_per_page: 25,
  });
  getPerson.mockResolvedValue(EXISTING);
  allPeople.mockResolvedValue([EXISTING, LOGGED]);
});

function open(person?: Person, onSaved = vi.fn(), connecting?: ConnectTarget) {
  render(
    <PersonDialog
      open
      onOpenChange={vi.fn()}
      person={person}
      onSaved={onSaved}
      connecting={connecting}
    />,
  );
  return onSaved;
}

const save = () =>
  userEvent.click(
    screen.getByRole("button", {
      name: /Create person|Save changes|Add to your people/,
    }),
  );

describe("PersonDialog", () => {
  it("adds, edits and removes custom properties, sending them in order", async () => {
    const onSaved = open({
      ...EXISTING,
      custom_properties: [{ key: "Agency", value: "PADI" }],
    });

    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    await userEvent.type(screen.getByLabelText("Key of property 2"), " Size ");
    await userEvent.type(screen.getByLabelText("Value of Size"), " M ");
    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove property 3" }),
    );
    await save();

    await waitFor(() => expect(updatePerson).toHaveBeenCalled());
    expect(updatePerson.mock.calls[0][1].custom_properties).toEqual([
      { key: "Agency", value: "PADI" },
      { key: "Size", value: "M" },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("keeps a half-filled property in the form and says what is missing", async () => {
    open(EXISTING);

    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    await userEvent.type(screen.getByLabelText("Key of property 1"), "Size");
    await save();

    expect(await screen.findByText("Give this key a value")).toBeVisible();
    expect(updatePerson).not.toHaveBeenCalled();
  });

  it("leaves the properties of a person read without them alone", async () => {
    // `EXISTING` carries no `custom_properties`, as a response cached before
    // they existed does.
    open(EXISTING);

    await save();

    await waitFor(() => expect(updatePerson).toHaveBeenCalled());
    // `undefined`, which the request's JSON leaves out.
    expect(updatePerson.mock.calls[0][1].custom_properties).toBeUndefined();
  });

  it("creates a person from a name alone, sending null for what was left empty", async () => {
    const onSaved = open();

    await userEvent.type(screen.getByLabelText("Name *"), "  Robin  ");
    await save();

    await waitFor(() => expect(createPerson).toHaveBeenCalled());
    expect(createPerson.mock.calls[0][0]).toEqual({
      name: "Robin",
      email: null,
      phone: null,
      notes: "",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "person-new", name: "Robin" }),
    );
  });

  // Connecting by a typed username is gone, from the form and from the body.
  it("has no username field", () => {
    open();

    expect(screen.queryByLabelText(/username/i)).toBeNull();
  });

  it("shows a taken name, a flat refusal, on the name field", async () => {
    createPerson.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: "A person with this name already exists" },
      },
    });
    open();

    const name = screen.getByLabelText("Name *");
    await userEvent.type(name, "Alex M.");
    await save();

    const shown = await screen.findByText(
      "A person with this name already exists",
    );
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name.getAttribute("aria-describedby")).toContain(shown.id);
    expect(name).toHaveFocus();
    expect(screen.getByRole("alert")).not.toHaveTextContent("already exists");
  });

  it("seeds the person being edited, and never sends a username", async () => {
    const onSaved = open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Email")).toHaveValue(EXISTING.email),
    );
    await userEvent.clear(screen.getByLabelText("Phone"));
    await save();

    await waitFor(() => expect(updatePerson).toHaveBeenCalled());
    expect(updatePerson.mock.calls[0]).toEqual([
      EXISTING.uuid,
      {
        name: "Alex M.",
        email: EXISTING.email,
        phone: null,
        notes: EXISTING.notes,
      },
    ]);
    // The API answers a PATCH with a message, so the saved person is assembled.
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: EXISTING.uuid,
        username: "alexm",
        dive_count: 12,
      }),
    );
  });

  // A person read carries the account's username and picture, not its name.
  it("heads a connected person's form with its account's username", () => {
    open(EXISTING);

    expect(screen.getByText("@alexm")).toBeInTheDocument();
  });

  it("has no head for a person who is not connected", () => {
    open(LOGGED);

    expect(screen.queryByText(/^@/)).toBeNull();
  });
});

describe("PersonDialog connecting an account", () => {
  it("is headed by the account, fills the name, and says what saving shows", async () => {
    allPeople.mockResolvedValue([EXISTING]);
    open(undefined, vi.fn(), BY_ACCOUNT);

    const dialog = screen.getByRole("dialog", { name: "Add to your people" });
    expect(within(dialog).getByText("Robin Reef")).toBeInTheDocument();
    expect(within(dialog).getByText("@robin")).toBeInTheDocument();
    expect(screen.getByLabelText("Name *")).toHaveValue("Robin Reef");
    expect(dialog).toHaveTextContent(
      "Robin Reef will see your name, username and picture",
    );
  });

  it("creates a new person connected through the link, with no username", async () => {
    allPeople.mockResolvedValue([EXISTING]);
    const onSaved = open(undefined, vi.fn(), BY_LINK);

    await save();

    await waitFor(() => expect(createPerson).toHaveBeenCalled());
    expect(createPerson.mock.calls[0][0]).toEqual({
      name: "Sam Diver",
      email: null,
      phone: null,
      notes: "",
      connect_link: BY_LINK.token,
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "person-new" }),
    );
  });

  // The buddy logged by name months before they showed a code.
  it("opens on the person already named as the account, and connects them", async () => {
    getPerson.mockResolvedValue({ ...LOGGED, username: "samd" });
    const onSaved = open(undefined, vi.fn(), BY_LINK);

    const choice = await screen.findByLabelText("Add as");
    await waitFor(() => expect(choice).toHaveValue(LOGGED.uuid));
    // A person already connected is no candidate.
    expect(
      within(choice).queryByRole("option", { name: "Alex M." }),
    ).toBeNull();
    expect(screen.queryByLabelText("Name *")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();

    await save();

    await waitFor(() =>
      expect(updatePerson).toHaveBeenCalledWith(LOGGED.uuid, {
        connect_link: BY_LINK.token,
      }),
    );
    expect(createPerson).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: LOGGED.uuid, username: "samd" }),
      ),
    );
  });

  it("makes a new person instead where the diver picks that", async () => {
    open(undefined, vi.fn(), BY_ACCOUNT);

    const choice = await screen.findByLabelText("Add as");
    await userEvent.selectOptions(choice, "A new person");
    await save();

    await waitFor(() =>
      expect(createPerson.mock.calls[0][0]).toMatchObject({
        name: "Robin Reef",
        connect_account: BY_ACCOUNT.uuid,
      }),
    );
  });

  it("shows a refused connection in the dialog's own line", async () => {
    allPeople.mockResolvedValue([]);
    createPerson.mockRejectedValue(
      refusedOn("connect_link", "This connect link is no longer active."),
    );
    const onSaved = open(undefined, vi.fn(), BY_LINK);

    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This connect link is no longer active.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("PersonCombobox", () => {
  it("hands what was typed to the dialog as the new person's name", async () => {
    render(
      <PersonCombobox
        aria-label="Instructor"
        value={null}
        onChange={vi.fn()}
        addNewLabel="Add instructor..."
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "Robin Reef");
    await userEvent.click(
      await screen.findByRole("option", { name: "Add instructor..." }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New Person" });
    expect(within(dialog).getByLabelText("Name *")).toHaveValue("Robin Reef");
  });

  it("selects the person the dialog made", async () => {
    const onChange = vi.fn();
    render(
      <PersonCombobox
        aria-label="Instructor"
        value={null}
        onChange={onChange}
        addNewLabel="Add instructor..."
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Add instructor..." }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Person" });
    await userEvent.type(within(dialog).getByLabelText("Name *"), "Robin");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create person" }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("person-new"));
  });

  it("names a person it was handed by uuid", async () => {
    render(
      <PersonCombobox
        aria-label="Instructor"
        value={EXISTING.uuid}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveValue("Alex M."),
    );
  });
});
