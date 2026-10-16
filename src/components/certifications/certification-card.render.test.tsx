import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  Certification,
  CertificationFileInfo,
} from "@/lib/api/certifications";
import { reveal } from "@/test/intersection";
import { CertificationCard } from "./certification-card";

vi.mock("@/lib/api/certifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/certifications")>();
  return {
    ...actual,
    certificationsAPI: {
      ...actual.certificationsAPI,
      getCertificationFileBlob: vi.fn(),
    },
  };
});

const { certificationsAPI } = await import("@/lib/api/certifications");
const getBlob = vi.mocked(certificationsAPI.getCertificationFileBlob);

// jsdom implements neither.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  getBlob.mockReset();
  getBlob.mockResolvedValue(new Blob(["card"], { type: "image/webp" }));
  URL.createObjectURL = vi.fn(() => "blob:front");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const front = (
  overrides: Partial<CertificationFileInfo> = {},
): CertificationFileInfo => ({
  uuid: "file-1",
  side: "front",
  content_type: "image/webp",
  byte_size: 1024,
  original_filename: "front.webp",
  updated_at: "2026-03-01T00:00:00Z",
  ...overrides,
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

const handlers = () => ({
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
});

// The card is a list item, as every backdrop card is.
const card = (
  overrides: Partial<Certification> = {},
  props: Partial<ReturnType<typeof handlers>> = {},
) =>
  render(
    <ul>
      <CertificationCard
        certification={certification(overrides)}
        {...handlers()}
        {...props}
        isDeleting={false}
      />
    </ul>,
  );

const figure = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling;

describe("CertificationCard", () => {
  it("opens the certification from its level, a certification having no page", async () => {
    const onView = vi.fn();
    card({}, { onView });

    await userEvent.click(
      screen.getByRole("button", { name: "Advanced Nitrox" }),
    );

    expect(onView).toHaveBeenCalledOnce();
  });

  it("names its agency under the level, the diver's own for another one", () => {
    card({ agency: "other", agency_other: "Freediving Federation" });

    expect(screen.getByText("Freediving Federation")).toBeInTheDocument();
  });

  it("carries when it was earned to the month, then its number", () => {
    card({ certified_on: "2025-03-12", certification_number: "2309AB1234" });

    expect(figure("Certified")).toHaveTextContent(/^Mar 2025$/);
    expect(figure("Number")).toHaveTextContent("2309AB1234");
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Certified", "Number"],
    );
  });

  it("shows only the figures it has", () => {
    card({ certification_number: "2309AB1234" });

    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Number"],
    );
  });

  it("badges a lapsed card, and leaves one with no expiry alone", () => {
    const { unmount } = card({ expires_on: "2000-01-01" });
    expect(screen.getByText("Expired")).toBeInTheDocument();
    unmount();

    card();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
    expect(screen.queryByText("Expiring soon")).not.toBeInTheDocument();
  });

  it("edits and deletes from a menu named after the agency and level", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = card({}, { onEdit, onDelete });
    const item = container.querySelector("li") as HTMLElement;

    const menu = within(item).getByRole("button", {
      name: "Actions for PADI Advanced Nitrox",
    });
    await userEvent.click(menu);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit" }),
    );
    expect(onEdit).toHaveBeenCalledOnce();

    await userEvent.click(menu);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("CertificationCard's backdrop", () => {
  it("draws the card's front once it is on screen, versioned by the file", async () => {
    const { container } = card({ files: [front()] });
    expect(getBlob).not.toHaveBeenCalled();

    act(() => reveal());

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "blob:front",
      ),
    );
    expect(getBlob).toHaveBeenCalledWith(
      "cert-1",
      "front",
      "file-1:2026-03-01T00:00:00Z",
    );
    // Decorative: the level over it carries the name.
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("draws the water and asks for nothing where no front is stored", () => {
    const { container } = card({
      files: [front({ side: "back" })],
    });
    act(() => reveal());

    expect(getBlob).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lucide-badge-check")).not.toBeNull();
  });

  it("never fetches a PDF, which is not drawn", () => {
    const { container } = card({
      files: [front({ content_type: "application/pdf" })],
    });
    act(() => reveal());

    expect(getBlob).not.toHaveBeenCalled();
    expect(container.querySelector(".lucide-file-text")).not.toBeNull();
  });

  it("draws the water, not a broken image, when the front cannot be had", async () => {
    getBlob.mockRejectedValue(new Error("gone"));
    const { container } = card({ files: [front()] });
    act(() => reveal());

    await waitFor(() =>
      expect(container.querySelector(".lucide-image-off")).not.toBeNull(),
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
