import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpeciesPhotoPicker } from "./species-photo-picker";
import type { AdminSpecies } from "@/lib/api/admin";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  adminAPI: { getSpeciesPhotoCandidates: vi.fn(() => new Promise(() => {})) },
}));

const species = {
  uuid: "species-1",
  scientific_name: "Pterois volitans",
  common_name: "Red lionfish",
} as unknown as AdminSpecies;

describe("SpeciesPhotoPicker", () => {
  it("says it is loading the candidates", () => {
    render(
      <SpeciesPhotoPicker
        species={species}
        onClose={vi.fn()}
        onPin={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading candidates");
  });

  // The shared cap follows the visual viewport; a `dvh` cap of its own would
  // override it.
  it("leaves the dialog's height to the shared cap", () => {
    render(
      <SpeciesPhotoPicker
        species={species}
        onClose={vi.fn()}
        onPin={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog").className).not.toMatch(/90dvh/);
  });

  it("pins a pasted file without submitting a form around it", async () => {
    const outer = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onPin = vi.fn(async () => false);
    render(
      <form onSubmit={outer}>
        <SpeciesPhotoPicker species={species} onClose={vi.fn()} onPin={onPin} />
      </form>,
    );

    await userEvent.type(
      screen.getByLabelText("Commons file title or URL"),
      "File:Lionfish.jpg{Enter}",
    );

    expect(onPin).toHaveBeenCalledWith(species, "File:Lionfish.jpg");
    expect(outer).not.toHaveBeenCalled();
  });
});
