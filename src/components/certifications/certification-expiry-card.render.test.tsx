import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificationExpiryCard } from "./certification-expiry-card";
import type { User } from "@/lib/api/auth";
import type { CertificationExpiringResponse } from "@/lib/api/certifications";

// The card is a list of things that run out, and insurance is one of them: a lapsed
// policy stops a dive at the desk exactly as a lapsed rescue card does. What a render
// reaches is which rows appear, where each sends the diver, and that nothing at all is
// drawn on the ordinary day when nothing is due.

const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Sam",
    username: "sam",
    email: "sam@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
  } as User,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  certificationsAPI: { getExpiring: vi.fn() },
}));

const { certificationsAPI } = await import("@/lib/api/certifications");
const getExpiring = vi.mocked(certificationsAPI.getExpiring);

// Inside the 90-day window `certificationExpiryStatus` flags, and well outside it.
const soon = () => isoDaysFromNow(30);
const later = () => isoDaysFromNow(400);

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const noCertifications: CertificationExpiringResponse = { data: [] };

beforeEach(() => {
  Object.assign(auth.user, {
    insurance_provider: null,
    insurance_expires_on: null,
  });
  getExpiring.mockReset().mockResolvedValue(noCertifications);
});

describe("CertificationExpiryCard", () => {
  it("draws nothing when nothing needs renewing", async () => {
    auth.user.insurance_expires_on = later();
    const { container } = render(<CertificationExpiryCard />);

    await vi.waitFor(() => expect(getExpiring).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a policy inside the horizon on its own, named by the provider", async () => {
    Object.assign(auth.user, {
      insurance_provider: "DAN Europe",
      insurance_expires_on: soon(),
    });
    render(<CertificationExpiryCard />);

    expect(await screen.findByText("DAN Europe")).toBeInTheDocument();
    expect(screen.getByText("Dive insurance")).toBeInTheDocument();
    // `/settings` is where the policy is entered; certifications go to their own page.
    expect(screen.getByRole("link", { name: /DAN Europe/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(
      screen.getByRole("heading", { name: "Renewals" }),
    ).toBeInTheDocument();
  });

  it("says what is running out when no provider was named", async () => {
    auth.user.insurance_expires_on = soon();
    render(<CertificationExpiryCard />);

    expect(await screen.findByText("Dive insurance")).toBeInTheDocument();
  });

  it("puts the policy in one list with the cards, soonest first", async () => {
    getExpiring.mockResolvedValue({
      data: [
        {
          uuid: "cert-1",
          agency: "padi",
          name: "Rescue Diver",
          expires_on: isoDaysFromNow(60),
        },
      ],
    });
    Object.assign(auth.user, {
      insurance_provider: "DAN Europe",
      insurance_expires_on: isoDaysFromNow(10),
    });
    const { container } = render(<CertificationExpiryCard />);

    await screen.findByText("Rescue Diver");
    const text = container.textContent ?? "";
    expect(text.indexOf("DAN Europe")).toBeLessThan(
      text.indexOf("Rescue Diver"),
    );
  });

  it("leaves the card as it was when only a certification is flagged", async () => {
    getExpiring.mockResolvedValue({
      data: [
        {
          uuid: "cert-1",
          agency: "padi",
          name: "Rescue Diver",
          expires_on: soon(),
        },
      ],
    });
    render(<CertificationExpiryCard />);

    expect(await screen.findByText("Rescue Diver")).toBeInTheDocument();
    expect(screen.getByText("PADI")).toBeInTheDocument();
    expect(screen.queryByText("Dive insurance")).toBeNull();
  });
});
