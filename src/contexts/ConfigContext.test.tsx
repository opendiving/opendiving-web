import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfigProvider, useConfig } from "./ConfigContext";
import { DEFAULT_DARK_TILE_URL, DEFAULT_TILE_URL } from "@/lib/map-tiles";

function Readout() {
  const { googleClientId, gravatarEnabled, tiles } = useConfig();

  return (
    <dl>
      <dd data-testid="google">{googleClientId ?? "none"}</dd>
      <dd data-testid="gravatar">{String(gravatarEnabled)}</dd>
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
          gravatarEnabled: true,
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
    expect(screen.getByTestId("gravatar")).toHaveTextContent("true");
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
    expect(screen.getByTestId("gravatar")).toHaveTextContent("false");
    expect(screen.getByTestId("light")).toHaveTextContent(DEFAULT_TILE_URL);
    expect(screen.getByTestId("dark")).toHaveTextContent(DEFAULT_DARK_TILE_URL);
  });
});
