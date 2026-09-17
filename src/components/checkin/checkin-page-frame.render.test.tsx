import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

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

beforeEach(() => {
  Object.assign(auth.user, {
    units: "metric",
    date_of_birth: null,
    phone: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    insurance_provider: null,
    insurance_policy_number: null,
    insurance_expires_on: null,
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
      "Emergency contact",
      "Dive insurance",
      "Certifications",
      "Diving",
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
    expect(screen.queryByText("Emergency contact")).toBeNull();
    expect(screen.queryByText("Dive insurance")).toBeNull();
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
  it("hides its own controls, keeping the summary", () => {
    render(loaded());

    expect(screen.getByRole("button", { name: /print/i })).toHaveClass(
      "print:hidden",
    );
  });

  it("keeps a certification off a page boundary", () => {
    const { container } = render(loaded({ certifications: [certification()] }));

    expect(container.querySelector(".break-inside-avoid")).not.toBeNull();
  });
});

describe("before the requests land", () => {
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
