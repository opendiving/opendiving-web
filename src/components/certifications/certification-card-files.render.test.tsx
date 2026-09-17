import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificationCardFiles } from "./certification-card-files";
import {
  CERTIFICATION_FILE_ACCEPT,
  type Certification,
} from "@/lib/api/certifications";

const certification: Certification = {
  uuid: "cert-1",
  agency: "padi",
  name: "Advanced Nitrox",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

// A card with no files at all fetches nothing: `CertificationCardImage` is handed
// the embedded metadata and renders its placeholder without touching the API.
const renderFiles = () =>
  render(
    <CertificationCardFiles
      certification={certification}
      onChanged={() => {}}
    />,
  );

// Most modern e-cards are one-sided, so a diver who never fills the second slot
// has a complete record. The screen has to say that, or an empty back reads as
// something the diver still owes.
describe("the second card slot presents itself as optional", () => {
  it("heads the two slots so only the second is qualified", () => {
    renderFiles();

    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back or details (optional)")).toBeInTheDocument();
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
