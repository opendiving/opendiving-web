import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfigProvider, useConfig } from "./ConfigContext";
import {
  DEFAULT_STYLE_URL,
  DEFAULT_STYLE_URL_DARK,
  resolveBasemap,
} from "@/lib/basemap";

function Readout() {
  const { googleClientId, basemap } = useConfig();

  return (
    <dl>
      <dd data-testid="google">{googleClientId ?? "none"}</dd>
      <dd data-testid="light">{basemap.light}</dd>
      <dd data-testid="dark">{basemap.dark}</dd>
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
            styleUrlDark: "https://styles.example/night.json",
            attribution: "© Someone",
          }),
        }}
      >
        <Readout />
      </ConfigProvider>,
    );

    expect(screen.getByTestId("google")).toHaveTextContent("client-id");
    expect(screen.getByTestId("light")).toHaveTextContent(
      "https://styles.example/day.json",
    );
    expect(screen.getByTestId("dark")).toHaveTextContent(
      "https://styles.example/night.json",
    );
  });

  // The provider is mounted in the root layout, so this is what an isolated
  // component test sees - and it has to be the same thing an instance that
  // configures nothing shows, or those tests are asserting against a fiction.
  it("reads as an unconfigured instance with no provider above it", () => {
    render(<Readout />);

    expect(screen.getByTestId("google")).toHaveTextContent("none");
    // The bundled MapLibre pair, which is what an instance that configures
    // nothing actually draws - on every map, now that there is only one
    // renderer and no raster source beside it.
    expect(screen.getByTestId("light")).toHaveTextContent(DEFAULT_STYLE_URL);
    expect(screen.getByTestId("dark")).toHaveTextContent(
      DEFAULT_STYLE_URL_DARK,
    );
  });
});
