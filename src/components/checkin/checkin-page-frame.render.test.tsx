import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInPageFrame } from "./checkin-page-frame";
import type { User } from "@/lib/api/auth";
import type { Certification } from "@/lib/api/certifications";
import type { UserDiveStats } from "@/lib/api/dive-stats";

// The summary is the thing a diver hands across a desk, so what a render can reach is
// what is printed and in what order - and, as much as it matters here, what is *not*
// printed. jsdom does no layout and no print media, so the `print:` classes are pinned
// as classes and the rendering itself is walked in a browser.

const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Sam Reef",
    username: "sam",
    email: "sam@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
  } as User,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

// The three dialogs this page hosts reach the API on save. The agency vocabulary and
// `certificationFile` stay real - the summary's own rendering is built on them.
vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  authAPI: { updateProfile: vi.fn(), getAvatarBlob: vi.fn() },
}));

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/certifications")>()),
  certificationsAPI: {
    createCertification: vi.fn(),
    updateCertification: vi.fn(),
  },
}));

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { getCourses: vi.fn(), getCourse: vi.fn() },
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

const { authAPI } = await import("@/lib/api/auth");
const { coursesAPI } = await import("@/lib/api/courses");
const updateProfile = vi.mocked(authAPI.updateProfile);

// Both the avatar and a card thumbnail fetch their bytes through this, the endpoints
// being owner-only. Answering with a URL is what puts an `<img>` on the page.
vi.mock("@/hooks/useAuthedBlobUrl", () => ({
  useAuthedBlobUrl: (fetchBlob: unknown) => ({
    url: fetchBlob ? "blob:card" : null,
    isLoading: false,
    hasError: false,
    error: null,
  }),
}));

const certification = (over: Partial<Certification> = {}): Certification => ({
  uuid: "cert-1",
  agency: "padi",
  name: "Rescue Diver",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...over,
});

const stats: UserDiveStats = {
  user_uuid: "user-1",
  total_dives: 142,
  max_depth: 39.6,
  total_time: 360000,
  species_seen: 12,
  created_at: "2026-01-01T00:00:00+00:00",
};

const loaded = (over: Parameters<typeof CheckInPageFrame>[0] = {}) => (
  <CheckInPageFrame isLoading={false} stats={stats} {...over} />
);

// Everything a desk asks for. Most tests here are about something other than an empty
// group, and this is what keeps every section's "Not filled in yet." out of their way.
const COMPLETE: Partial<User> = {
  date_of_birth: "1988-04-02",
  phone: "+44 7700 900000",
  emergency_contact_name: "Alex Reef",
  emergency_contact_phone: "+44 7700 900111",
  insurance_provider: "DAN Europe",
  insurance_policy_number: "P-42",
};

beforeEach(() => {
  Object.assign(auth.user, {
    units: "metric",
    avatar_sha256: null,
    date_of_birth: null,
    phone: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    insurance_provider: null,
    insurance_policy_number: null,
    insurance_expires_on: null,
  });
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  updateProfile.mockReset().mockResolvedValue(undefined);
  vi.mocked(coursesAPI.getCourses).mockReset().mockResolvedValue({
    data: [],
    total_count: 0,
    has_more: false,
    page: 1,
    items_per_page: 10,
  });
});

describe("what the summary prints", () => {
  it("runs from the diver down to the diving, in the order a desk reads it", () => {
    Object.assign(auth.user, {
      date_of_birth: "1988-04-02",
      phone: "+44 7700 900000",
      emergency_contact_name: "Alex Reef",
      insurance_provider: "DAN Europe",
      insurance_expires_on: "2027-03-01",
    });
    const { container } = render(
      loaded({
        certifications: [certification()],
        lastDiveAt: "2026-08-14T09:30:00+02:00",
      }),
    );

    const text = container.textContent ?? "";
    const order = [
      "Sam Reef",
      "Date of birth",
      "Phone",
      "Certifications",
      "Diving",
      "Dive insurance",
      "Emergency contact",
    ].map((label) => text.indexOf(label));

    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("leaves out a field the diver never filled in, rather than labelling a blank", () => {
    Object.assign(auth.user, { phone: "+44 7700 900000" });
    render(loaded());

    expect(screen.getByText("Phone")).toBeInTheDocument();
    // Not "Date of birth: —": a blank line on a page handed to a stranger reads as
    // something withheld rather than something not held.
    expect(screen.queryByText("Date of birth")).toBeNull();
  });

  it("keeps every section on screen, and takes the empty ones off the print", () => {
    Object.assign(auth.user, {
      ...COMPLETE,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    });
    render(loaded({ certifications: [certification()] }));

    // Every heading is there with its own control, however little is under it -
    // which is what makes each group reachable without leaving the page.
    for (const title of ["Certifications", "Diving", "Dive insurance"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(
      screen.getByText("Dive insurance").closest("section"),
    ).not.toHaveClass("print:hidden");

    // A group the diver never filled in says so on screen and is gone from the
    // sheet: a heading with nothing under it is the labelled blank in another form.
    const emergency = screen.getByText("Emergency contact").closest("section");
    expect(emergency).toHaveClass("print:hidden");
    expect(
      within(emergency as HTMLElement).getByText("Not filled in yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit your emergency contact" }),
    ).toBeInTheDocument();
  });

  it("never reads a failed fetch as an empty account", () => {
    Object.assign(auth.user, COMPLETE);
    // A rejected list leaves the same empty array a diver with no cards has, and a
    // rejected `/user/dive-stats` the same null - so neither section may claim
    // emptiness here. The banner above says what happened and offers the retry.
    render(loaded({ loadFailed: true, stats: null }));

    expect(screen.queryByText("No certifications yet.")).toBeNull();
    const diving = screen.getByText("Diving").closest("section");
    expect(
      within(diving as HTMLElement).queryByText("Not filled in yet."),
    ).toBeNull();
  });

  it("says so where a diver holds no cards at all", () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded());

    const cards = screen.getByText("Certifications").closest("section");
    expect(cards).toHaveClass("print:hidden");
    expect(
      within(cards as HTMLElement).getByText("No certifications yet."),
    ).toBeInTheDocument();
  });

  it("names the agency in words and never draws its mark", () => {
    render(loaded({ certifications: [certification()] }));

    expect(screen.getByText("PADI Rescue Diver")).toBeInTheDocument();
  });

  it("says a card is on file as a PDF instead of attempting a thumbnail", () => {
    const { container } = render(
      loaded({
        certifications: [
          certification({
            files: [
              {
                uuid: "file-1",
                side: "front",
                content_type: "application/pdf",
                byte_size: 1024,
                original_filename: "card.pdf",
              },
            ],
          }),
        ],
      }),
    );

    expect(screen.getByText("card on file as PDF")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the stored front when it is an image", () => {
    render(
      loaded({
        certifications: [
          certification({
            files: [
              {
                uuid: "file-1",
                side: "front",
                content_type: "image/jpeg",
                byte_size: 1024,
                original_filename: "card.jpg",
              },
            ],
          }),
        ],
      }),
    );

    expect(
      screen.getByAltText("front of certification card"),
    ).toBeInTheDocument();
  });

  it("gives the depth in the diver's own units", () => {
    render(loaded());
    expect(screen.getByText("39.6 m")).toBeInTheDocument();

    auth.user.units = "imperial";
    render(loaded());
    expect(screen.getByText("130 ft")).toBeInTheDocument();
  });

  it("carries the last dive's date, and nothing where there is no dive", () => {
    const { rerender } = render(
      loaded({ lastDiveAt: "2026-08-14T09:30:00+02:00" }),
    );
    expect(screen.getByText("Last dive")).toBeInTheDocument();
    expect(screen.getByText("Aug 14, 2026")).toBeInTheDocument();

    rerender(loaded({ lastDiveAt: null }));
    expect(screen.queryByText("Last dive")).toBeNull();
  });
});

describe("what the print leaves behind", () => {
  it("names the saved PDF after the diver and the day, and gives the tab back", () => {
    Object.assign(auth.user, COMPLETE);
    const tabTitle = "OpenDiving";
    document.title = tabTitle;
    render(loaded({ certifications: [certification()] }));

    // There is no API for the filename: the browser takes it from `document.title`
    // as the dialog opens, so the swap rides `beforeprint` - which is also what
    // gives Cmd+P the same name as the Print button.
    window.dispatchEvent(new Event("beforeprint"));
    expect(document.title).toMatch(
      /^Sam Reef - diver check-in - \d{4}-\d{2}-\d{2}$/,
    );

    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe(tabTitle);
  });

  it("hides its own controls, keeping the summary", () => {
    render(loaded());

    expect(screen.getByRole("button", { name: /print/i })).toHaveClass(
      "print:hidden",
    );
  });

  it("keeps each block a reader takes as one thing off a page boundary", () => {
    Object.assign(auth.user, COMPLETE);
    const { container } = render(loaded({ certifications: [certification()] }));

    // An emergency contact split over a fold is a name on one sheet and the number
    // to ring on another.
    for (const title of ["Diving", "Dive insurance", "Emergency contact"]) {
      expect(screen.getByText(title).closest("section")).toHaveClass(
        "break-inside-avoid",
      );
    }
    expect(
      screen.getByText(/^Printed /).closest("p") ??
        screen.getByText(/^Printed /),
    ).toHaveClass("break-inside-avoid");
    expect(container.querySelector(".flex.break-inside-avoid")).not.toBeNull();

    // Not the certifications section itself: a diver with a handful of cards is
    // taller than a page, and refusing to break something that cannot fit only moves
    // the break to the top and wastes the page. Its unit is the card.
    expect(
      screen.getByText("Certifications").closest("section"),
    ).not.toHaveClass("break-inside-avoid");
  });
});

describe("before the requests land", () => {
  it("puts each placeholder card where its row will land", () => {
    const { container } = render(<CheckInPageFrame />);

    // jsdom lays nothing out, so what is checkable is that the placeholder carries
    // the same geometry classes as `CertificationSummary` - the gutter cancel and
    // the image slot. Without them the whole list jumps left and resizes the moment
    // the fetch returns.
    const rows = container.querySelectorAll("[aria-hidden] .flex.gap-4");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row).toHaveClass("-ml-20", "sm:-ml-28");
      expect(row.firstElementChild).toHaveClass("w-16", "sm:w-24", "h-12");
    });
  });

  it("holds the shape with placeholders, and announces the regions as busy", () => {
    const { container } = render(<CheckInPageFrame />);

    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    const bars = container.querySelectorAll(".animate-skeleton");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
  });

  it("draws the profile straight away, it having arrived with the session", () => {
    Object.assign(auth.user, { phone: "+44 7700 900000" });
    render(<CheckInPageFrame />);

    expect(screen.getByText("Sam Reef")).toBeInTheDocument();
    expect(screen.getByText("+44 7700 900000")).toBeInTheDocument();
  });
});

describe("the picture at the top", () => {
  it("draws the one the diver stored", () => {
    Object.assign(auth.user, { ...COMPLETE, avatar_sha256: "abc123" });
    render(loaded({ certifications: [certification()] }));

    // Radix holds `AvatarImage` back until the bytes have loaded, which jsdom never
    // reports - so the initials standing in are the tile itself being on the page.
    expect(screen.getByText("SR")).toBeInTheDocument();
  });

  it("leaves a monogram nobody chose off a sheet handed to a stranger", () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded({ certifications: [certification()] }));

    expect(
      screen.getByRole("heading", { name: "Sam Reef" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("SR")).toBeNull();
  });
});

describe("labels and values line up", () => {
  it("puts both halves of every pair straight into the list's own grid", () => {
    Object.assign(auth.user, COMPLETE);
    const { container } = render(
      loaded({
        certifications: [certification({ certification_number: "12345" })],
      }),
    );

    const lists = [...container.querySelectorAll("dl")];
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      expect(list.className).toContain("grid-cols-[auto_1fr]");
      // A pair wrapped in a `<div>` of its own would occupy one cell, and each value
      // would start wherever its own label happened to end - which is the ragged
      // edge the grid exists to remove. jsdom does no layout, so the structure is
      // what can be pinned here.
      for (const cell of list.querySelectorAll("dt, dd")) {
        expect(cell.parentElement).toBe(list);
      }
    }
  });
});

describe("editing from the sheet", () => {
  it("opens the settings form over the summary, and gives the summary back on save", async () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded({ certifications: [certification()] }));

    await userEvent.click(
      screen.getByRole("button", {
        name: "Edit your name, date of birth and phone number",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "About you" });
    // The very fields `/settings` shows, because they are the same component.
    expect(within(dialog).getByLabelText("Phone number")).toHaveValue(
      "+44 7700 900000",
    );

    await userEvent.clear(within(dialog).getByLabelText("Phone number"));
    await userEvent.type(within(dialog).getByLabelText("Phone number"), "0123");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "0123" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "About you" })).toBeNull(),
    );
  });

  it("gives each section a control that opens that group and nothing else", async () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded({ certifications: [certification()] }));

    await userEvent.click(
      screen.getByRole("button", { name: "Edit your dive insurance" }),
    );
    const insurance = await screen.findByRole("dialog", {
      name: "Dive insurance",
    });
    expect(within(insurance).getByLabelText("Provider")).toHaveValue(
      "DAN Europe",
    );
    // The emergency contact has its own control and its own dialog, so a diver
    // correcting one group is never handed the other two to scroll past.
    expect(
      within(insurance).queryByLabelText("Relationship to you"),
    ).toBeNull();

    await userEvent.click(
      within(insurance).getByRole("button", { name: /save changes/i }),
    );
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        insurance_provider: "DAN Europe",
        insurance_policy_number: "P-42",
        insurance_expires_on: null,
      }),
    );
  });

  it("opens a card in the certification form it is edited in everywhere else", async () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded({ certifications: [certification()] }));

    await userEvent.click(
      screen.getByRole("button", { name: "Edit Rescue Diver" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit Certification",
    });
    expect(within(dialog).getByLabelText("Certification *")).toHaveValue(
      "Rescue Diver",
    );
  });

  it("re-reads the list rather than editing the card it holds", async () => {
    Object.assign(auth.user, COMPLETE);
    const onCertificationsChanged = vi.fn();
    render(
      loaded({ certifications: [certification()], onCertificationsChanged }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Edit Rescue Diver" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Certification",
    });
    await userEvent.clear(within(dialog).getByLabelText("Certification *"));
    await userEvent.type(
      within(dialog).getByLabelText("Certification *"),
      "Rescue Diver (2026)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    // The page re-reads `GET /certifications` rather than this component patching
    // its own copy: the order is the endpoint's, and a `certified_on` edited here
    // has to land where that puts it.
    await waitFor(() => expect(onCertificationsChanged).toHaveBeenCalled());
  });

  it("offers no way to add a card, cards being kept where cards are kept", () => {
    Object.assign(auth.user, COMPLETE);
    render(loaded({ certifications: [certification()] }));

    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });
});

describe("correcting the diving figures", () => {
  const withDiving = () =>
    loaded({
      certifications: [certification()],
      lastDiveAt: "2026-08-14T09:30:00+02:00",
    });

  it("prints what the diver typed, and says it went nowhere", async () => {
    Object.assign(auth.user, COMPLETE);
    render(withDiving());
    expect(screen.getByText("142")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Diving" });
    const dives = within(dialog).getByLabelText("Dives logged");
    await userEvent.clear(dives);
    await userEvent.type(dives, "310");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /use on this summary/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.getByText("310")).toBeInTheDocument();
    expect(screen.queryByText("142")).toBeNull();
    expect(
      screen.getByText(/nothing was saved to your log/i),
    ).toBeInTheDocument();
  });

  it("hands the log's own figures back", async () => {
    Object.assign(auth.user, COMPLETE);
    render(withDiving());

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    const dives = within(
      await screen.findByRole("dialog", { name: "Diving" }),
    ).getByLabelText("Dives logged");
    await userEvent.clear(dives);
    await userEvent.type(dives, "310");
    await userEvent.click(
      screen.getByRole("button", { name: /use on this summary/i }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );

    // The undo only exists once there is something to undo, which is why it is
    // looked for after the correction rather than before it.
    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /use logged figures/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.queryByText(/nothing was saved to your log/i)).toBeNull();
  });

  it("lets a diver whose log has nothing in it correct the count", async () => {
    Object.assign(auth.user, COMPLETE);
    // What `/user/dive-stats` answers for a diver with nothing logged, which is the
    // diver this dialog is for: the box opens on that zero, and a schema refusing it
    // would block the submit on a field nobody touched.
    render(
      loaded({
        stats: { ...stats, total_dives: 0, max_depth: 0 },
        certifications: [certification()],
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Diving" });
    expect(within(dialog).getByLabelText("Max depth (m)")).toHaveValue(0);

    const dives = within(dialog).getByLabelText("Dives logged");
    await userEvent.clear(dives);
    await userEvent.type(dives, "400");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /use on this summary/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.getByText("400")).toBeInTheDocument();
  });

  it("keeps the way back when every figure is cleared, and drops the heading from the sheet", async () => {
    Object.assign(auth.user, COMPLETE);
    render(withDiving());

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Diving" });
    await userEvent.clear(within(dialog).getByLabelText("Dives logged"));
    await userEvent.clear(within(dialog).getByLabelText("Max depth (m)"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Clear" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /use on this summary/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.queryByText("Dives logged")).toBeNull();
    // The section that removed itself would take the only route back to the logged
    // figures with it, leaving a correction in force with nothing on screen saying so.
    expect(
      screen.getByRole("button", { name: "Correct these figures" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing was saved to your log/i),
    ).toBeInTheDocument();
    // Not "Not filled in yet." beside it: the one diver who can reach this state is
    // the one who just emptied figures that were there.
    const diving = screen.getByText("Diving").closest("section");
    expect(
      within(diving as HTMLElement).queryByText("Not filled in yet."),
    ).toBeNull();
    // A desk is handed no heading with nothing under it.
    expect(screen.getByText("Diving").closest("section")).toHaveClass(
      "print:hidden",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /use logged figures/i }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("keeps the correction off the sheet's own ink", async () => {
    Object.assign(auth.user, COMPLETE);
    render(withDiving());

    await userEvent.click(
      screen.getByRole("button", { name: "Correct these figures" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Diving" })).getByRole(
        "button",
        { name: /use on this summary/i },
      ),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Diving" })).toBeNull(),
    );
    expect(screen.getByText(/nothing was saved to your log/i)).toHaveClass(
      "print:hidden",
    );
  });
});
