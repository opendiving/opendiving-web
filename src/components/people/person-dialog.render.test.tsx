import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonDialog } from "./person-dialog";
import { PersonCombobox } from "./person-combobox";
import type { Person } from "@/lib/api/people";

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    createPerson: vi.fn(),
    updatePerson: vi.fn(),
    getPeople: vi.fn(),
    getPerson: vi.fn(),
  },
}));

const { peopleAPI } = await import("@/lib/api/people");
const createPerson = vi.mocked(peopleAPI.createPerson);
const updatePerson = vi.mocked(peopleAPI.updatePerson);
const getPeople = vi.mocked(peopleAPI.getPeople);
const getPerson = vi.mocked(peopleAPI.getPerson);

const EXISTING: Person = {
  uuid: "person-1",
  name: "Alex M.",
  email: "alex@example.com",
  phone: "+44 7700 900111",
  notes: "Rescue diver, dives a drysuit.",
  username: "alexm",
  dive_count: 12,
  created_at: "2026-03-01T09:00:00Z",
};

// FastAPI's own 422 for a refusal the API makes on one body field.
const refusedOnUsername = (msg: string) => ({
  response: {
    status: 422,
    data: {
      detail: [
        { type: "value_error", loc: ["body", "username"], msg, input: "x" },
      ],
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
});

function open(person?: Person, onSaved = vi.fn()) {
  render(
    <PersonDialog
      open
      onOpenChange={vi.fn()}
      person={person}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

const username = () => screen.getByLabelText("Username");
const save = () =>
  userEvent.click(
    screen.getByRole("button", { name: /Create person|Save changes/ }),
  );

describe("PersonDialog", () => {
  it("creates a person from a name alone, sending null for what was left empty", async () => {
    const onSaved = open();

    await userEvent.type(screen.getByLabelText("Name *"), "  Robin  ");
    await save();

    await waitFor(() => expect(createPerson).toHaveBeenCalled());
    expect(createPerson.mock.calls[0][0]).toEqual({
      name: "Robin",
      username: null,
      email: null,
      phone: null,
      notes: "",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "person-new", name: "Robin" }),
    );
  });

  it("links a username, without the @ a diver copies off a picker", async () => {
    open();

    await userEvent.type(screen.getByLabelText("Name *"), "Alex M.");
    await userEvent.type(username(), "@alexm");
    await save();

    await waitFor(() => expect(createPerson).toHaveBeenCalled());
    expect(createPerson.mock.calls[0][0]).toMatchObject({ username: "alexm" });
  });

  it.each([
    "No account has that username.",
    "That is your own account.",
    "Sam is already linked to that account.",
  ])("shows the API's %s on the username field", async (message) => {
    createPerson.mockRejectedValue(refusedOnUsername(message));
    const onSaved = open();

    await userEvent.type(screen.getByLabelText("Name *"), "Alex M.");
    await userEvent.type(username(), "alexm");
    await save();

    // On the field, where the diver typed it - and not a second time in the
    // dialog's own line.
    const shown = await screen.findByText(message);
    expect(username()).toHaveAttribute("aria-invalid", "true");
    expect(username().getAttribute("aria-describedby")).toContain(shown.id);
    expect(screen.getByRole("alert")).not.toHaveTextContent(message);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps a duplicate name, a flat refusal, in the dialog's own line", async () => {
    createPerson.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: "A person with this name already exists" },
      },
    });
    open();

    await userEvent.type(screen.getByLabelText("Name *"), "Alex M.");
    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A person with this name already exists",
    );
    expect(username()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("seeds the person being edited, and unlinks with an explicit null", async () => {
    const onSaved = open(EXISTING);

    await waitFor(() => expect(username()).toHaveValue("alexm"));
    expect(screen.getByLabelText("Email")).toHaveValue(EXISTING.email);

    await userEvent.clear(username());
    await userEvent.clear(screen.getByLabelText("Phone"));
    await save();

    await waitFor(() => expect(updatePerson).toHaveBeenCalled());
    expect(updatePerson.mock.calls[0]).toEqual([
      EXISTING.uuid,
      {
        name: "Alex M.",
        username: null,
        email: EXISTING.email,
        phone: null,
        notes: EXISTING.notes,
      },
    ]);
    // The API answers a PATCH with a message, so the saved person is assembled.
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: EXISTING.uuid,
        username: null,
        dive_count: 12,
      }),
    );
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
