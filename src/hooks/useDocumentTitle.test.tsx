import { beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { useDocumentTitle } from "./useDocumentTitle";

function Probe({ name, section }: { name?: string; section?: string }) {
  useDocumentTitle(name, section);
  return null;
}

describe("useDocumentTitle", () => {
  beforeEach(() => {
    document.title = "Dives – OpenDiving";
  });

  it("names the tab within its section, and gives the section's name back", () => {
    const { unmount } = render(
      <Probe name="#44 El Puertito" section="Dives" />,
    );
    expect(document.title).toBe("#44 El Puertito – Dives – OpenDiving");

    unmount();
    expect(document.title).toBe("Dives – OpenDiving");
  });

  it("leaves the tab alone until the name has loaded", () => {
    render(<Probe section="Dives" />);

    expect(document.title).toBe("Dives – OpenDiving");
  });

  // Next keeps the route being left mounted under a hidden `<Activity>`, and its
  // cleanup runs after the next route has named the tab.
  it("keeps a title the next route set before this one let go", () => {
    const left = render(<Probe name="#44 El Puertito" section="Dives" />);
    render(<Probe name="Apeks XTX50" section="Gear" />);

    left.unmount();
    expect(document.title).toBe("Apeks XTX50 – Gear – OpenDiving");
  });
});
