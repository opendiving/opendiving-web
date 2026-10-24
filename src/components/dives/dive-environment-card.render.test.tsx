import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveEnvironmentCard } from "./dive-environment-card";
import type { Dive } from "@/lib/api/dives";
import { dive, diveConditions } from "@/test/dive-fixtures";
import type { UnitSystem } from "@/lib/units";

const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

afterEach(() => {
  auth.units = "metric";
});

// The Blue Hole dive as the worker leaves it: three fields filled, and the
// service's own figures beside them.
const filledDive = (overrides: Partial<Dive> = {}) =>
  dive({
    start_time: "2026-09-15T10:00:00+03:00",
    air_temperature: 38.1,
    weather: "clear",
    waves: "slight",
    conditions: diveConditions(),
    ...overrides,
  });

const figure = (label: string | RegExp) =>
  screen.getByText(label).closest("div")!;

const tideDiagram = () => screen.getByRole("img", { name: /^Tide:/ });

const isMarked = (label: string | RegExp) =>
  figure(label).querySelector('[title^="Filled in from weather data"]') !==
  null;

describe("DiveEnvironmentCard, with fetched conditions", () => {
  it("shows the service's figures beside the diver's", () => {
    render(<DiveEnvironmentCard dive={filledDive()} />);

    expect(screen.getByText("38.1°C")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.getByText("Slight")).toBeInTheDocument();
    expect(screen.getByText("Wind from NNE")).toBeInTheDocument();
    expect(screen.getByText("21 km/h")).toBeInTheDocument();
    expect(figure("Sea temperature")).toHaveTextContent("27.7°C");
    expect(figure("Wave height")).toHaveTextContent("0.6 m");
    expect(tideDiagram()).toBeInTheDocument();
  });

  // Each turn at the record's offset, whatever offset the instant was written
  // at: 06:30 UTC is 09:30 at +03:00.
  it("draws the tide between its turns, at the record's offset", () => {
    render(<DiveEnvironmentCard dive={filledDive()} />);

    expect(tideDiagram()).toHaveAccessibleName(
      "Tide: high water at 09:30, low water at 15:00; " +
        "the dive began at 10:00, at high water",
    );
    expect(tideDiagram()).toHaveTextContent("High 09:30");
    expect(tideDiagram()).toHaveTextContent("Low 15:00");
    expect(screen.queryByText(/^(Last|Next) /)).toBeNull();
  });

  // The curve runs on past each turn by a quarter of the 5.5 h between them, so
  // 8.25 h are drawn from 08:07:30: the turns sit a sixth in from either end, and
  // the dive's 10:00 is 1.875 h along, just past the top of the high.
  it("marks the dive where it falls between the turns", () => {
    render(<DiveEnvironmentCard dive={filledDive()} />);

    const start = screen.getByTestId("tide-dive-start");
    expect(start.style.left).toBe("22.73%");
    expect(start.style.top).toBe("11.62%");
    expect(screen.getByText("09:30").parentElement!.style.left).toBe("16.67%");
    expect(screen.getByText("15:00").parentElement!.style.left).toBe("83.33%");
    expect(screen.getByTestId("tide-dive-span")).toBeInTheDocument();
  });

  // A dive whose own offset is unknown takes the one the record resolved, and
  // one turn gives a curve nothing to span, so it stays the figures.
  it("spells them at the record's offset for a dive with none of its own", () => {
    render(
      <DiveEnvironmentCard
        dive={filledDive({
          start_time: "2026-01-15T10:00:00",
          conditions: diveConditions({
            utc_offset_minutes: 120,
            sea: {
              model: "meteofrance_wave",
              tide_state: "rising",
              next_extreme: {
                kind: "high",
                at: "2026-01-15T11:20:00+02:00",
                height: 0.3,
              },
            },
          }),
        })}
      />,
    );

    expect(figure("Next high")).toHaveTextContent("11:20");
    expect(figure("Tide")).toHaveTextContent("Rising");
    expect(screen.queryByRole("img", { name: /^Tide:/ })).toBeNull();
  });

  it("shows the wind in mph and the waves in feet on an imperial account", () => {
    auth.units = "imperial";
    render(<DiveEnvironmentCard dive={filledDive()} />);

    expect(screen.getByText("13 mph")).toBeInTheDocument();
    expect(figure("Wave height")).toHaveTextContent("2 ft");
  });

  it("marks the filled fields and nothing else", () => {
    render(<DiveEnvironmentCard dive={filledDive({ current: "light" })} />);

    expect(isMarked("Air temperature")).toBe(true);
    expect(isMarked("Weather")).toBe(true);
    expect(isMarked("Waves")).toBe(true);
    expect(isMarked("Current")).toBe(false);
  });

  // The diver's own value, and a value replaced since the fetch wrote it, carry
  // no mark.
  it("leaves a typed value unmarked", () => {
    render(
      <DiveEnvironmentCard
        dive={filledDive({
          weather: "overcast",
          conditions: diveConditions({
            filled: { air_temperature: 38.1, weather: null, waves: "slight" },
          }),
          air_temperature: 30,
        })}
      />,
    );

    expect(isMarked("Weather")).toBe(false);
    expect(isMarked("Air temperature")).toBe(false);
    expect(isMarked("Waves")).toBe(true);
  });

  it("credits the service as visible text, with its links", () => {
    render(<DiveEnvironmentCard dive={filledDive()} />);

    expect(
      screen.getByRole("link", { name: "Weather data by Open-Meteo.com" }),
    ).toHaveAttribute("href", "https://open-meteo.com/");
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(
      screen.getByText(/with weather, waves and tide times derived from it/),
    ).toBeInTheDocument();
  });

  it("renders on the fetched figures alone", () => {
    render(
      <DiveEnvironmentCard
        dive={dive({
          conditions: diveConditions({
            filled: { air_temperature: null, weather: null, waves: null },
          }),
        })}
      />,
    );

    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.getByText("21 km/h")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Weather data by Open-Meteo.com" }),
    ).toBeInTheDocument();
  });

  // A freshwater dive is answered with no sea block.
  it("draws no sea figure the record lacks", () => {
    render(
      <DiveEnvironmentCard
        dive={filledDive({
          waves: null,
          conditions: diveConditions({ sea: null }),
        })}
      />,
    );

    expect(screen.queryByText("Sea temperature")).toBeNull();
    expect(screen.queryByText("Wave height")).toBeNull();
    expect(screen.queryByText("Tide")).toBeNull();
    expect(screen.queryByText(/^(Last|Next) /)).toBeNull();
    expect(screen.getByText("Wind from NNE")).toBeInTheDocument();
  });
});

describe("DiveEnvironmentCard, without fetched conditions", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
  ])("draws nothing new when they are %s", (_label, conditions) => {
    render(
      <DiveEnvironmentCard
        dive={dive({ weather: "clear", air_temperature: 24, conditions })}
      />,
    );

    expect(isMarked("Weather")).toBe(false);
    expect(screen.queryByText(/Wind/)).toBeNull();
    expect(screen.queryByText(/Open-Meteo/)).toBeNull();
  });

  it("renders nothing for a dive with nothing to show", () => {
    const { container } = render(<DiveEnvironmentCard dive={dive()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
