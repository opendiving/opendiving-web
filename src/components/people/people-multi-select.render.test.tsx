import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeopleMultiSelect } from "./people-multi-select";
import type { Person, PersonReference, PersonRole } from "@/lib/api/people";

// The invariant this field exists for: typing a fragment of a name or of a username
// lists the person, choosing them adds a row with the host's default role, an
// unmatched name on Enter adds a row for a new person of that name, and the role can
// be changed on the row without leaving the field.

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: { getPeople: vi.fn(), getPerson: vi.fn(), createPerson: vi.fn() },
  fetchAllPeople: vi.fn(),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { peopleAPI, fetchAllPeople } = await import("@/lib/api/people");
const getPeople = vi.mocked(peopleAPI.getPeople);
const createPerson = vi.mocked(peopleAPI.createPerson);

const person = (
  uuid: string,
  name: string,
  username: string | null = null,
): Person => ({
  uuid,
  name,
  username,
  notes: "",
  dive_count: 0,
  created_at: "2026-01-01T00:00:00Z",
});

const ALEX = person("person-alex", "Alex M.", "alexm");
const SAM = person("person-sam", "Sam");

const page = (items: Person[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 25,
});

beforeEach(() => {
  vi.clearAllMocks();
  // A server search: the name *or* the linked username. The combobox must not
  // filter what comes back a second time.
  getPeople.mockImplementation(async (_page, _perPage, search) =>
    page(
      [ALEX, SAM].filter(
        (one) =>
          !search ||
          one.name.toLowerCase().includes(search.toLowerCase()) ||
          (one.username ?? "").includes(search.toLowerCase()),
      ),
    ),
  );
  vi.mocked(fetchAllPeople).mockResolvedValue([ALEX, SAM]);
});

function Field({
  defaultRole = "buddy",
  initial = [],
  onChange,
}: {
  defaultRole?: PersonRole | null;
  initial?: PersonReference[];
  onChange?: (value: PersonReference[]) => void;
}) {
  const [value, setValue] = useState<PersonReference[]>(initial);
  return (
    <PeopleMultiSelect
      aria-label="People"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      defaultRole={defaultRole}
    />
  );
}

const combobox = () => screen.getByRole("combobox", { name: "People" });
const roleOf = (name: string) =>
  screen.findByRole("combobox", { name: `Role of ${name}` });

describe("PeopleMultiSelect", () => {
  it("lists a person by a fragment of their username, with it as the hint", async () => {
    render(<Field />);

    await userEvent.click(combobox());
    await userEvent.type(combobox(), "alexm");

    // Once the server has answered the query rather than the opening one.
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "Sam" })).toBeNull(),
    );
    expect(getPeople).toHaveBeenLastCalledWith(1, 25, "alexm");
    expect(
      screen.getByRole("option", { name: "Alex M., @alexm" }),
    ).toBeInTheDocument();
  });

  it("adds a picked person with the host's role", async () => {
    const onChange = vi.fn();
    render(<Field defaultRole="student" onChange={onChange} />);

    await userEvent.click(combobox());
    await userEvent.type(combobox(), "Sam");
    await userEvent.click(await screen.findByRole("option", { name: "Sam" }));

    expect(await roleOf("Sam")).toHaveValue("student");
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: SAM.uuid, role: "student" },
    ]);
  });

  it("adds a person with no role where the host has none", async () => {
    const onChange = vi.fn();
    render(<Field defaultRole={null} onChange={onChange} />);

    await userEvent.click(combobox());
    await userEvent.click(await screen.findByRole("option", { name: "Sam" }));

    expect(await roleOf("Sam")).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: SAM.uuid, role: null },
    ]);
  });

  it("makes a person of an unmatched name on Enter, and adds them", async () => {
    // A name is a whole person, so nobody has to open a dialog to add one.
    const created = person("person-new", "Robin");
    createPerson.mockResolvedValue(created);
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    await userEvent.click(combobox());
    await userEvent.type(combobox(), "Robin");
    await screen.findByText(/Nobody matches/);
    await userEvent.keyboard("{Enter}");

    expect(await roleOf("Robin")).toHaveValue("buddy");
    expect(createPerson).toHaveBeenCalledWith({ name: "Robin" });
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: created.uuid, role: "buddy" },
    ]);
  });

  it("takes the person already called that when the name is refused as taken", async () => {
    // Enter inside the search's debounce: the person exists, the search had not
    // said so yet, and the API refuses a second of the name.
    getPeople.mockImplementation(async (_page, _perPage, search) =>
      page(search === "sam" ? [SAM] : []),
    );
    createPerson.mockRejectedValue({
      response: { data: { detail: "A person with this name already exists" } },
    });
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    await userEvent.click(combobox());
    await userEvent.type(combobox(), "sam{Enter}");

    expect(await roleOf("Sam")).toHaveValue("buddy");
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: SAM.uuid, role: "buddy" },
    ]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("changes a row's role without leaving the field, and clears it to none", async () => {
    const onChange = vi.fn();
    render(
      <Field
        initial={[{ person_uuid: SAM.uuid, role: "buddy" }]}
        onChange={onChange}
      />,
    );

    const role = await roleOf("Sam");
    await userEvent.selectOptions(role, "guide");
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: SAM.uuid, role: "guide" },
    ]);

    await userEvent.selectOptions(role, "No role");
    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: SAM.uuid, role: null },
    ]);
  });

  it("keeps a role this build has no word for", async () => {
    // A newer API's role, read back as a string: shown as itself, and sent back
    // as it came rather than cleared by the next save.
    render(<Field initial={[{ person_uuid: SAM.uuid, role: "crew" }]} />);

    const role = await roleOf("Sam");
    expect(role).toHaveValue("crew");
    expect(role).toHaveDisplayValue("Crew");
  });

  it("names a row's controls after the person, and removes the one pressed", async () => {
    const onChange = vi.fn();
    render(
      <Field
        initial={[
          { person_uuid: ALEX.uuid, role: "buddy" },
          { person_uuid: SAM.uuid, role: "guide" },
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Sam" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([
      { person_uuid: ALEX.uuid, role: "buddy" },
    ]);
    expect(screen.getByText("@alexm")).toBeInTheDocument();
  });

  it("offers nobody twice", async () => {
    render(<Field initial={[{ person_uuid: SAM.uuid, role: "buddy" }]} />);
    await roleOf("Sam");

    await userEvent.click(combobox());

    await screen.findByRole("option", { name: "Alex M., @alexm" });
    expect(screen.queryByRole("option", { name: "Sam" })).toBeNull();
  });

  it("opens the dialog on Add person..., seeded with what was typed", async () => {
    render(<Field />);

    await userEvent.click(combobox());
    await userEvent.type(combobox(), "Robin Reef");
    await userEvent.click(
      await screen.findByRole("option", { name: "Add person..." }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New Person" });
    await waitFor(() =>
      expect(screen.getByLabelText("Name *")).toHaveValue("Robin Reef"),
    );
    expect(dialog).toBeInTheDocument();
    expect(createPerson).not.toHaveBeenCalled();
  });
});
