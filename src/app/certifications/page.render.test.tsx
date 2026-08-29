import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CertificationsPage from "./page";
import {
  certificationsAPI,
  type Certification,
} from "@/lib/api/certifications";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api/certifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/certifications")>();
  return {
    ...actual,
    certificationsAPI: {
      ...actual.certificationsAPI,
      getCertifications: vi.fn(),
    },
  };
});

const certification = (
  overrides: Partial<Certification> = {},
): Certification => ({
  uuid: "cert-1",
  agency: "padi",
  name: "Advanced Nitrox",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

const getCertifications = vi.mocked(certificationsAPI.getCertifications);

beforeEach(() => {
  vi.clearAllMocks();
  getCertifications.mockResolvedValue(page([certification()]));
});

// A screen reader's controls list is flat: ten rows of "Edit" name nothing, so each
// row's controls carry the card they act on. See DECISIONS.md, "Ten rows of 'Edit'
// name nothing".
describe("certification row actions name their row", () => {
  it("names each row's controls after the certification", async () => {
    render(<CertificationsPage />);
    await screen.findByRole("button", { name: "Advanced Nitrox" });

    expect(
      screen.getByRole("button", {
        name: "Card images for PADI Advanced Nitrox",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit PADI Advanced Nitrox" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete PADI Advanced Nitrox" }),
    ).toBeInTheDocument();
  });

  it("tells two cards of the same level apart by their agency", async () => {
    // Certifications carry no unique-name constraint, and holding the same level
    // from two agencies is ordinary - so the name alone would leave both rows'
    // controls reading identically.
    getCertifications.mockResolvedValue(
      page([certification(), certification({ uuid: "cert-2", agency: "tdi" })]),
    );

    render(<CertificationsPage />);
    await screen.findAllByRole("button", { name: "Advanced Nitrox" });

    const editButtons = screen.getAllByRole("button", { name: /^Edit / });
    expect(
      editButtons.map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Edit PADI Advanced Nitrox", "Edit TDI Advanced Nitrox"]);
  });
});
