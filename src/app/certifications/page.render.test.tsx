import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CertificationsPage from "./page";
import {
  certificationsAPI,
  type Certification,
} from "@/lib/api/certifications";

// Returned by identity rather than rebuilt per call, and for `user` that is
// load-bearing rather than tidiness: the real `AuthContext` holds it in state, so it
// keeps one identity across renders, and this page's fetch callback lists `user` in
// its dependencies. A mock handing back a fresh `user` per render gives
// `usePaginatedResource` a new `fetchFn` every time, and its fetch-on-mount effect
// re-runs on every render the fetch itself causes. See "The new-dive render test was
// in a loop with itself" in DECISIONS.md, and "reads the certification list once"
// below.
//
// `vi.hoisted` because a `vi.mock` factory is hoisted above every other statement in
// the file and so cannot close over an ordinary `const`.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  },
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
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

// The page's fetch callback closes over `user`, and `usePaginatedResource` fetches
// from an effect keyed on the callback - so anything that gives `user` a new identity
// per render puts the effect in a loop with the fetch it started.
//
// `mockImplementation` rather than this file's usual `mockResolvedValue`, and that is
// the whole reason this test can fail: a single resolved value is one object handed
// back to every call, so `setItems` receives the array it already holds, React bails
// out of the re-render, and the loop stalls after a handful of passes. Measured, the
// same mount goes from 4 fetches a second to ~290 once each call answers with its own
// object, which is what a real API client does. See "A shared mock response object
// hides a render loop" in DECISIONS.md.
describe("the certification list is read once, not once per render", () => {
  it("reads the certification list once", async () => {
    getCertifications.mockImplementation(async () => page([certification()]));

    render(<CertificationsPage />);
    await screen.findByRole("button", { name: "Advanced Nitrox" });

    expect(getCertifications).toHaveBeenCalledTimes(1);
  });
});
