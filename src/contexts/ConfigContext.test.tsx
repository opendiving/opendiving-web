import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfigProvider, useConfig } from "./ConfigContext";
import { DEFAULT_STYLE_URL, resolveBasemap } from "@/lib/basemap";
import { DEFAULT_TILE_URL } from "@/lib/map-tiles";

function Readout() {
  const { googleClientId, basemap, tiles } = useConfig();

  return (
    <dl>
      <dd data-testid="google">{googleClientId ?? "none"}</dd>
      <dd data-testid="style">{basemap.light}</dd>
      <dd data-testid="light">{tiles.light}</dd>
      <dd data-testid="dark">{tiles.dark}</dd>
    </dl>
  );
}

describe("useConfig", () => {
  it("hands down what the provider was given", () => {
    render(
      <ConfigProvider
        config={{
          googleClientId: "client-id",
          basemap: resolveBasemap({
            styleUrl: "https://styles.example/day.json",
            attribution: "© Someone",
          }),
          tiles: {
            light: "https://tiles.example/{z}/{x}/{y}.png",
            dark: "https://tiles.example/dark/{z}/{x}/{y}.png",
            attribution: "© Someone",
          },
        }}
      >
        <Readout />
      </ConfigProvider>,
    );

    expect(screen.getByTestId("google")).toHaveTextContent("client-id");
    expect(screen.getByTestId("style")).toHaveTextContent(
      "https://styles.example/day.json",
    );
    expect(screen.getByTestId("light")).toHaveTextContent(
      "https://tiles.example/{z}/{x}/{y}.png",
    );
  });

  // The provider is mounted in the root layout, so this is what an isolated
  // component test sees - and it has to be the same thing an instance that
  // configures nothing shows, or those tests are asserting against a fiction.
  it("reads as an unconfigured instance with no provider above it", () => {
    render(<Readout />);

    expect(screen.getByTestId("google")).toHaveTextContent("none");
    // The bundled MapLibre style, which is what an instance that configures
    // nothing actually draws.
    expect(screen.getByTestId("style")).toHaveTextContent(DEFAULT_STYLE_URL);
    expect(screen.getByTestId("light")).toHaveTextContent(DEFAULT_TILE_URL);
    // The same template: the default provider has no dark tiles of its own.
    expect(screen.getByTestId("dark")).toHaveTextContent(DEFAULT_TILE_URL);
  });
});
