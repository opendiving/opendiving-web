import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDialog } from "./trip-dialog";
import type { Trip } from "@/lib/api/trips";

// The parts field and the map are tested next door and in `components/map/`.
// What only this render reaches is the arrangement of the form itself: the
// order the fields are asked in, and that the map is part of the dialog rather
// than something that appears once a place has been picked.

vi.mock("@/lib/api/trips", () => ({
  tripsAPI: { createTrip: vi.fn(), updateTrip: vi.fn() },
}));

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  contactsAPI: { lookupContacts: vi.fn(), getContact: vi.fn() },
}));

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    lookupPeople: vi.fn(),
    getPerson: vi.fn(),
    createPerson: vi.fn(),
  },
}));

const { tripsAPI } = await import("@/lib/api/trips");
const { contactsAPI } = await import("@/lib/api/contacts");
const { peopleAPI } = await import("@/lib/api/people");
const updateTrip = vi.mocked(tripsAPI.updateTrip);
const createTrip = vi.mocked(tripsAPI.createTrip);

const SAM = {
  uuid: "person-sam",
  name: "Sam",
  notes: "",
  username: null,
  dive_count: 0,
  created_at: "2026-03-01T09:00:00Z",
};

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

// The real map is behind `next/dynamic`, which renders its skeleton and nothing
// else in a test environment - so there would be no way to tell "the map is
// there" from "the map was gated out". This stands in for it and reports what
// it was asked for.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: ({ showWhenEmpty }: { showWhenEmpty?: boolean }) => (
    <div data-testid="locations-map" data-show-when-empty={!!showWhenEmpty} />
  ),
}));

function renderDialog() {
  return render(<TripDialog open onOpenChange={() => {}} onSaved={() => {}} />);
}

describe("TripDialog", () => {
  // A part carries its own dates, so the only dates in this dialog are inside
  // the rows the Parts field holds - and a new trip opens with one of them.
  it("asks for the name, then a part, then the people and the notes", () => {
    renderDialog();

    const labels = Array.from(document.querySelectorAll("label")).map((label) =>
      label.textContent?.trim(),
    );

    expect(labels).toEqual([
      "Name *",
      "Parts",
      "Location part 1 of 1",
      "Accommodation part 1 of 1",
      "Start date part 1 of 1",
      "End date part 1 of 1",
      "People",
      "Notes",
    ]);
  });

  it("saves a trip given only a name with no parts at all", async () => {
    // The part a new trip opens with, left untouched, records nothing.
    createTrip.mockImplementation(async (body) => ({
      uuid: "trip-new",
      name: body.name,
      parts: body.parts ?? [],
      people: [],
      notes: "",
      user_uuid: "user-1",
      created_at: "2026-04-01T09:00:00Z",
      dive_count: 0,
      dive_site_count: 0,
      species_count: 0,
      max_depth: null,
      candidate_count: 0,
      contact_uuids: [],
    }));
    renderDialog();

    await userEvent.type(screen.getByLabelText("Name *"), "Egypt, spring");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    expect(createTrip.mock.calls[0][0].parts).toEqual([]);
  });

  it("opens an existing trip with its own parts and no extra one", () => {
    render(
      <TripDialog
        open
        onOpenChange={() => {}}
        trip={{
          uuid: "trip-1",
          name: "Egypt, spring",
          parts: [],
          notes: "",
          user_uuid: "user-1",
          created_at: "2026-04-01T09:00:00Z",
          dive_count: 0,
          dive_site_count: 0,
          species_count: 0,
          max_depth: null,
          candidate_count: 0,
          contact_uuids: [],
        }}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText(/No parts yet/)).toBeInTheDocument();
  });

  // The whole of the error path, through the resolver rather than around it:
  // the schema reports a reversed range at `parts.1.end_date`, which makes
  // react-hook-form's `errors.parts` an array with no message of its own. A
  // `FormMessage` over the list renders that as the word "undefined" and
  // refuses the save with nothing a diver can act on.
  it("says which part's dates are the wrong way round", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Name *"), "Egypt, spring");
    await userEvent.click(screen.getByRole("button", { name: "Add a part" }));

    await userEvent.click(screen.getByLabelText("Start date part 2 of 2"));
    await userEvent.paste("2026-04-22");
    await userEvent.click(screen.getByLabelText("End date part 2 of 2"));
    await userEvent.paste("2026-04-18");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));

    expect(
      await screen.findByText("End date must be on or after start date"),
    ).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("shows the map before any place has been picked", () => {
    // A frame that arrived with the first place would shove everything under it
    // down the dialog mid-edit.
    renderDialog();

    expect(screen.getByTestId("locations-map")).toHaveAttribute(
      "data-show-when-empty",
      "true",
    );
  });

  // The map sits under the parts, not over them: the diver searched for a name,
  // and the map answers "yes, that is the place you meant".
  it("puts the map below the parts and above the notes", () => {
    renderDialog();

    const map = screen.getByTestId("locations-map");
    const picker = screen.getByRole("combobox", { name: /^Location part/ });
    const notes = screen.getByLabelText("Notes");

    expect(picker.compareDocumentPosition(map)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(map.compareDocumentPosition(notes)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("adds a person with no role, since a trip has no word for who came", async () => {
    vi.mocked(peopleAPI.lookupPeople).mockResolvedValue({
      data: [SAM],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 25,
    });
    createTrip.mockImplementation(async (body) => ({
      uuid: "trip-new",
      name: body.name,
      parts: [],
      people: body.people,
      notes: "",
      user_uuid: "user-1",
      created_at: "2026-04-01T09:00:00Z",
      dive_count: 0,
      dive_site_count: 0,
      species_count: 0,
      max_depth: null,
      candidate_count: 0,
      contact_uuids: [],
    }));
    renderDialog();

    await userEvent.type(screen.getByLabelText("Name *"), "Egypt, spring");
    await userEvent.click(screen.getByLabelText("People"));
    await userEvent.click(await screen.findByRole("option", { name: "Sam" }));
    expect(
      await screen.findByRole("combobox", { name: "Role of Sam" }),
    ).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    expect(createTrip.mock.calls[0][0].people).toEqual([
      { person_uuid: SAM.uuid, role: null },
    ]);
  });

  it("keeps the trip's people, roles and all, through an edit that never touched them", async () => {
    vi.mocked(peopleAPI.getPerson).mockResolvedValue(SAM);
    updateTrip.mockResolvedValue({ message: "Trip updated" });
    const people = [{ person_uuid: SAM.uuid, role: "companion" }];
    render(
      <TripDialog
        open
        onOpenChange={() => {}}
        trip={{
          uuid: "trip-1",
          name: "Egypt, spring",
          parts: [],
          people,
          notes: "",
          user_uuid: "user-1",
          created_at: "2026-04-01T09:00:00Z",
          dive_count: 0,
          dive_site_count: 0,
          species_count: 0,
          max_depth: null,
          candidate_count: 0,
          contact_uuids: [],
        }}
        onSaved={() => {}}
      />,
    );
    expect(
      await screen.findByRole("combobox", { name: "Role of Sam" }),
    ).toHaveValue("companion");

    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(updateTrip).toHaveBeenCalled());
    expect(updateTrip.mock.calls[0][1].people).toEqual(people);
  });

  it("keeps every part's accommodation through an edit that never touched it", async () => {
    // The API replaces the parts wholesale, so a member the dialog's open or its
    // submit left out of a part is a member every save clears.
    vi.mocked(contactsAPI.getContact).mockImplementation(async (uuid) => ({
      uuid,
      name: "Coral Hotel",
      roles: ["accommodation"],
      notes: "",
      user_uuid: "user-1",
      created_at: "2026-03-01T09:00:00Z",
    }));
    updateTrip.mockResolvedValue({ message: "Trip updated" });
    const trip: Trip = {
      uuid: "trip-1",
      name: "Egypt, spring",
      parts: [
        { location: { name: "Dahab" }, start_date: "2026-04-18" },
        { location: { name: "Sharm" }, accommodation_uuid: "contact-coral" },
      ],
      notes: "",
      user_uuid: "user-1",
      created_at: "2026-04-01T09:00:00Z",
      dive_count: 0,
      dive_site_count: 0,
      species_count: 0,
      max_depth: null,
      candidate_count: 0,
      contact_uuids: [],
    };
    render(
      <TripDialog
        open
        onOpenChange={() => {}}
        trip={trip}
        onSaved={() => {}}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Name *"));
    await userEvent.type(screen.getByLabelText("Name *"), "Egypt, April");
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(updateTrip).toHaveBeenCalled());
    expect(
      updateTrip.mock.calls[0][1].parts?.map((part) => part.accommodation_uuid),
    ).toEqual([null, "contact-coral"]);
  });

  it("ranks the people picker at the trip's earliest dated day, not its first part's", async () => {
    vi.mocked(peopleAPI.lookupPeople).mockResolvedValue({
      data: [SAM],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 25,
    });
    const trip: Trip = {
      uuid: "trip-1",
      name: "Egypt, spring",
      // In the diver's drag order: an undated part, then a later one first.
      parts: [
        { location: { name: "Cairo" } },
        { location: { name: "Sharm" }, start_date: "2026-04-25" },
        { location: { name: "Dahab" }, start_date: "2026-04-18" },
      ],
      notes: "",
      user_uuid: "user-1",
      created_at: "2026-04-01T09:00:00Z",
      dive_count: 0,
      dive_site_count: 0,
      species_count: 0,
      max_depth: null,
      candidate_count: 0,
      contact_uuids: [],
    };
    render(
      <TripDialog
        open
        onOpenChange={() => {}}
        trip={trip}
        onSaved={() => {}}
      />,
    );

    await userEvent.click(screen.getByLabelText("People"));

    await waitFor(() =>
      expect(peopleAPI.lookupPeople).toHaveBeenCalledWith(1, 25, {
        search: "",
        until: "2026-04-18",
      }),
    );
  });
});
