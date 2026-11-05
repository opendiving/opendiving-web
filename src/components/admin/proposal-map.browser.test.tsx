import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { ProposalMap } from "./proposal-map";
import type { ReviewMarker } from "./proposal-markers";
import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";

// Measures boxes, so the app's stylesheet has to be here: see the same import in
// `locations-map.browser.test.tsx`.
import "@/app/globals.css";

// A style that draws nothing and asks for nothing, as that file's is.
const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

const drawn = (markers: ReviewMarker[]) =>
  render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <ConfigProvider
        config={{
          basemap: resolveBasemap({
            styleUrl: EMPTY_STYLE,
            attribution:
              "[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)",
          }),
        }}
      >
        <div style={{ width: 600 }}>
          <ProposalMap markers={markers} />
        </div>
      </ConfigProvider>
    </ThemeProvider>,
  );

const marker = (kind: ReviewMarker["kind"]) =>
  document.querySelector<HTMLElement>(`[data-marker="${kind}"]`);

const centreOf = (element: HTMLElement) => {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
};

const PROPOSED: ReviewMarker = {
  kind: "proposed",
  label: "Proposed",
  latitude: 27.5,
  longitude: 34.25,
};

describe("ProposalMap", () => {
  it("labels every marker, and centres on the proposed pin however far a match is", async () => {
    drawn([
      PROPOSED,
      { kind: "current", label: "Current", latitude: 27.51, longitude: 34.25 },
      {
        kind: "match",
        label: "Coral Gardens · 900 m",
        latitude: 27.5,
        longitude: 34.26,
      },
    ]);

    await waitFor(() => expect(marker("match")).not.toBeNull());
    expect(marker("match")).toHaveTextContent("Coral Gardens · 900 m");
    expect(marker("current")).toHaveTextContent("Current");
    expect(marker("proposed")).toHaveTextContent("Proposed");

    const frame = screen.getByRole("group").getBoundingClientRect();
    await waitFor(() => {
      const { x, y } = centreOf(marker("proposed")!);
      expect(Math.abs(x - (frame.left + frame.right) / 2)).toBeLessThan(2);
      expect(Math.abs(y - (frame.top + frame.bottom) / 2)).toBeLessThan(2);
    });

    // Fitted, not merely centred: the furthest pin is inside the frame.
    const far = centreOf(marker("match")!);
    expect(far.x).toBeLessThan(frame.right);
  });

  it("holds a match across the antimeridian, going the short way round", async () => {
    drawn([
      { ...PROPOSED, latitude: -16.5, longitude: 179.99 },
      {
        kind: "match",
        label: "Across",
        latitude: -16.5,
        longitude: -179.99,
      },
    ]);

    await waitFor(() => expect(marker("match")).not.toBeNull());
    const frame = screen.getByRole("group").getBoundingClientRect();
    await waitFor(() => {
      const { x } = centreOf(marker("match")!);
      expect(x).toBeGreaterThan(frame.left);
      expect(x).toBeLessThan(frame.right);
    });
  });
});
