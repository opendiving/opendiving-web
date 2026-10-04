import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactDialog } from "./contact-dialog";
import { ContactCombobox } from "./contact-combobox";
import type { Contact } from "@/lib/api/contacts";

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  // The role vocabulary and its labels are real: the boxes come from them.
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  contactsAPI: {
    createContact: vi.fn(),
    updateContact: vi.fn(),
    lookupContacts: vi.fn(),
    getContact: vi.fn(),
  },
}));

const { contactsAPI } = await import("@/lib/api/contacts");
const createContact = vi.mocked(contactsAPI.createContact);
const updateContact = vi.mocked(contactsAPI.updateContact);
const lookupContacts = vi.mocked(contactsAPI.lookupContacts);
const getContact = vi.mocked(contactsAPI.getContact);

const EXISTING: Contact = {
  uuid: "contact-1",
  name: "Blue Ocean",
  roles: ["dive_center", "accommodation"],
  phone: "+20 69 364 0000",
  email: "info@blueocean.example",
  website: "https://blueocean.example",
  address: {
    street: null,
    city: "Dahab",
    postcode: null,
    region: "South Sinai",
    country: "Egypt",
  },
  notes: "Ask for Ahmed.",
  user_uuid: "user-1",
  created_at: "2026-03-01T09:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  createContact.mockImplementation(async (body) => ({
    ...EXISTING,
    ...body,
    uuid: "contact-new",
    roles: body.roles ?? [],
    notes: body.notes ?? "",
  }));
  updateContact.mockResolvedValue({ message: "Contact updated" });
  lookupContacts.mockResolvedValue({
    data: [EXISTING],
    total_count: 1,
    has_more: false,
    page: 1,
    items_per_page: 25,
  });
  getContact.mockResolvedValue(EXISTING);
});

function open(props: Partial<Parameters<typeof ContactDialog>[0]> = {}) {
  const onSaved = vi.fn();
  render(
    <ContactDialog open onOpenChange={vi.fn()} onSaved={onSaved} {...props} />,
  );
  return onSaved;
}

const ticked = () =>
  screen
    .getAllByRole("checkbox")
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.closest("label")?.textContent);

const create = () =>
  userEvent.click(screen.getByRole("button", { name: "Create contact" }));

describe("ContactDialog", () => {
  it("starts a new contact on the roles its host hands it, and no others", () => {
    open({ initialRoles: ["school"] });

    expect(ticked()).toEqual(["School"]);
  });

  it("starts a contact made from the contacts page on no role at all", () => {
    open();

    expect(ticked()).toEqual([]);
  });

  it("sends a bare host with its scheme, and every empty field as null", async () => {
    const onSaved = open({ initialRoles: ["dive_center"] });

    await userEvent.type(screen.getByLabelText("Name *"), "Sea Dragon");
    await userEvent.type(screen.getByLabelText("Website"), "seadragon.example");
    await create();

    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(createContact.mock.calls[0][0]).toEqual({
      name: "Sea Dragon",
      roles: ["dive_center"],
      phone: null,
      email: null,
      website: "https://seadragon.example",
      address: null,
      notes: "",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "contact-new" }),
    );
  });

  it("refuses an address without its country, and focuses the box", async () => {
    open();

    await userEvent.type(screen.getByLabelText("Name *"), "Grandma's house");
    await userEvent.type(screen.getByLabelText("Address"), "12 Harbour Road");
    await create();

    expect(
      await screen.findByText("An address needs its country"),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText("Country *")).toHaveFocus(),
    );
    expect(createContact).not.toHaveBeenCalled();
  });

  it("opens an existing contact with its address showing, and saves every field", async () => {
    const onSaved = open({ contact: EXISTING });

    await waitFor(() =>
      expect(screen.getByLabelText("Name *")).toHaveValue("Blue Ocean"),
    );
    expect(screen.getByLabelText("City")).toBeVisible();
    expect(ticked()).toEqual(["Dive center", "Accommodation"]);

    // Clearing a field is sending null for it: the update leaves an absent key
    // alone, so an omitted phone would survive a save that reported success.
    await userEvent.clear(screen.getByLabelText("Phone"));
    await userEvent.click(screen.getByLabelText("Shop"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateContact).toHaveBeenCalled());
    expect(updateContact.mock.calls[0]).toEqual([
      "contact-1",
      {
        name: "Blue Ocean",
        roles: ["dive_center", "accommodation", "shop"],
        phone: null,
        email: "info@blueocean.example",
        website: "https://blueocean.example",
        address: {
          street: null,
          city: "Dahab",
          postcode: null,
          region: "South Sinai",
          country: "Egypt",
        },
        notes: "Ask for Ahmed.",
      },
    ]);
    // Handed back in the vocabulary's order, which is how the API stores them.
    expect(onSaved.mock.calls[0][0].roles).toEqual([
      "dive_center",
      "shop",
      "accommodation",
    ]);
  });

  it("clears a stored address with an explicit null", async () => {
    open({ contact: EXISTING });
    await waitFor(() =>
      expect(screen.getByLabelText("City")).toHaveValue("Dahab"),
    );

    await userEvent.clear(screen.getByLabelText("City"));
    await userEvent.clear(screen.getByLabelText("Region"));
    await userEvent.clear(screen.getByLabelText(/^Country/));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateContact).toHaveBeenCalled());
    expect(updateContact.mock.calls[0][1]).toMatchObject({ address: null });
  });
});

describe("ContactCombobox", () => {
  it("hands what was typed to the dialog as the new contact's name", async () => {
    render(
      <ContactCombobox
        aria-label="Dive center"
        value={null}
        onChange={vi.fn()}
        addNewLabel="Add dive center..."
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "Sea Dragon");
    await userEvent.click(
      await screen.findByRole("option", { name: "Add dive center..." }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New Contact" });
    expect(within(dialog).getByLabelText("Name *")).toHaveValue("Sea Dragon");
  });

  it("does not file the contact already picked as a new one's name", async () => {
    render(
      <ContactCombobox
        aria-label="Dive center"
        value={EXISTING.uuid}
        onChange={vi.fn()}
        addNewLabel="Add dive center..."
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveValue("Blue Ocean"),
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Add dive center..." }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New Contact" });
    expect(within(dialog).getByLabelText("Name *")).toHaveValue("");
  });

  it("selects the contact the dialog made", async () => {
    const onChange = vi.fn();
    render(
      <ContactCombobox
        aria-label="Dive center"
        value={null}
        onChange={onChange}
        initialRoles={["dive_center"]}
        addNewLabel="Add dive center..."
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Add dive center..." }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Contact" });
    await userEvent.type(within(dialog).getByLabelText("Name *"), "Sea Dragon");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create contact" }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("contact-new"));
  });

  it("asks the lookup at the record's date, and lists a pin first", async () => {
    const pinned: Contact = {
      ...EXISTING,
      uuid: "contact-pin",
      name: "Sea Dragon",
    };
    getContact.mockResolvedValue(pinned);
    lookupContacts.mockResolvedValue({
      data: [EXISTING, pinned],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 25,
    });
    render(
      <ContactCombobox
        aria-label="Dive center"
        value={null}
        onChange={vi.fn()}
        until="2024-05-01"
        pinnedUuids={[pinned.uuid]}
      />,
    );
    await waitFor(() => expect(getContact).toHaveBeenCalledWith(pinned.uuid));

    await userEvent.click(screen.getByRole("combobox"));

    await screen.findByRole("option", { name: /Blue Ocean/ });
    expect(lookupContacts).toHaveBeenCalledWith(1, 25, {
      search: "",
      until: "2024-05-01",
    });
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent)
        .filter((text) => !text?.startsWith("Add ")),
    ).toEqual(["Sea Dragon, Dahab, Egypt", "Blue Ocean, Dahab, Egypt"]);
  });
});
