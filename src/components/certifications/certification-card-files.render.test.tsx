import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificationCardFiles } from "./certification-card-files";
import type { CertificationCardEdits } from "@/lib/certification-card-edits";
import {
  CERTIFICATION_FILE_ACCEPT,
  type Certification,
  type CertificationFileInfo,
} from "@/lib/api/certifications";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The card image endpoint is owner-only and fetched through the API client; a slot
// showing a stored file would otherwise reach for it under jsdom.
vi.mock("@/lib/api/certifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/certifications")>();
  return {
    ...actual,
    certificationsAPI: {
      ...actual.certificationsAPI,
      getCertificationFileBlob: vi.fn(() => new Promise<Blob>(() => {})),
    },
  };
});

const front: CertificationFileInfo = {
  uuid: "019fe94e-c13c-7166-9dad-5af54eb08319",
  side: "front",
  content_type: "image/webp",
  byte_size: 145904,
  original_filename: "padi-divemaster.webp",
};

const certification: Certification = {
  uuid: "cert-1",
  agency: "padi",
  name: "Advanced Nitrox",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

const renderFiles = (
  overrides: {
    certification?: Certification | null;
    edits?: CertificationCardEdits;
  } = {},
) => {
  const onChange = vi.fn();
  render(
    <CertificationCardFiles
      certification={
        overrides.certification === undefined
          ? certification
          : overrides.certification
      }
      edits={overrides.edits ?? {}}
      onChange={onChange}
    />,
  );
  return { onChange };
};

// Neither slot is required - no card image reaches `certificationSchema` at all -
// and a diver who fills neither has a complete record. The screen has to carry
// that, or an empty slot reads as something the diver still owes. Qualifying only
// one of them was the old mistake: it said the other was required.
describe("neither card slot is presented as required", () => {
  it("names what each slot takes, and marks neither required", () => {
    renderFiles();

    // Bare nouns, and the test is that they stay bare: the asterisk this form puts
    // on a required field is on neither, and so is any qualifier - one on the back
    // alone says the front is required, which it is not.
    for (const heading of ["Front", "Back"]) {
      expect(screen.getByText(heading).textContent).toBe(heading);
    }
  });

  it("describes an unfilled slot without calling it missing", () => {
    renderFiles();

    expect(screen.getAllByText("Not uploaded")).toHaveLength(2);
  });

  // Derived from the accept list rather than spelled out, so widening what the
  // picker takes fails here instead of quietly warning a diver off a format that
  // displays perfectly well - `CertificationCardImage` renders everything except
  // a PDF through an `<img>`.
  it("names every image format the picker accepts, and only the PDF as download-only", () => {
    renderFiles();

    const guidance = screen.getByText(/images are shown here/);
    const displayable = CERTIFICATION_FILE_ACCEPT.split(",")
      .filter((type) => type !== "application/pdf")
      .map((type) => type.replace("image/", "").toUpperCase());

    expect(displayable.length).toBeGreaterThan(0);
    for (const format of displayable) {
      expect(guidance).toHaveTextContent(format);
    }
    expect(guidance).toHaveTextContent("PDF");
  });
});

// Every slot state has to be legible as *what the save will do*, because none of
// it has happened yet. A picture on screen that might be the stored one or might
// be the replacement is the failure this wording exists to prevent.
describe("a slot says what saving the form will do to it", () => {
  it("names the stored file while nothing has been changed", () => {
    renderFiles({ certification: { ...certification, files: [front] } });

    expect(screen.getByText(/padi-divemaster\.webp/)).toBeInTheDocument();
  });

  it("marks a struck-off image as deleted on save, not deleted", () => {
    renderFiles({
      certification: { ...certification, files: [front] },
      edits: { front: { kind: "remove" } },
    });

    expect(screen.getByText("Deleted when you save")).toBeInTheDocument();
    // The stored filename is gone from the slot: it is no longer what the slot
    // will hold.
    expect(screen.queryByText(/padi-divemaster\.webp/)).not.toBeInTheDocument();
  });

  it("says a picked image replaces the stored one rather than adding to it", () => {
    renderFiles({
      certification: { ...certification, files: [front] },
      edits: {
        front: {
          kind: "replace",
          image: {
            blob: new Blob(["x"], { type: "image/webp" }),
            filename: "card-front.webp",
          },
        },
      },
    });

    expect(
      screen.getByText(/Replaces the stored image when you save/),
    ).toBeInTheDocument();
  });

  it("says a picked image is added when the slot was empty", () => {
    renderFiles({
      edits: {
        back: {
          kind: "replace",
          image: {
            blob: new Blob(["x"], { type: "image/webp" }),
            filename: "card-back.webp",
          },
        },
      },
    });

    expect(screen.getByText(/Added when you save/)).toBeInTheDocument();
  });
});

// Nothing this component does may reach the API: the form owns the save, and a
// diver who cancels has to leave the stored cards untouched.
describe("removing a stored image is a local mark", () => {
  it("reports the removal to the form instead of deleting it", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiles({
      certification: { ...certification, files: [front] },
    });

    await user.click(screen.getByRole("button", { name: /Remove the front/ }));

    expect(onChange).toHaveBeenCalledWith({ front: { kind: "remove" } });
  });

  it("drops a picked image outright, there being nothing stored to mark", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiles({
      edits: {
        front: {
          kind: "replace",
          image: {
            blob: new Blob(["x"], { type: "image/webp" }),
            filename: "card-front.webp",
          },
        },
      },
    });

    await user.click(screen.getByRole("button", { name: /Discard the new/ }));

    expect(onChange).toHaveBeenCalledWith({});
  });
});
