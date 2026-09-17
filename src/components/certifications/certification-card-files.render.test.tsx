import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CertificationCardFiles } from "./certification-card-files";
import type { Certification } from "@/lib/api/certifications";

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

  it("says which formats are shown, since a PDF can only be downloaded", () => {
    renderFiles();

    expect(
      screen.getByText(/PNG and JPEG images are shown here/),
    ).toBeInTheDocument();
  });
});
