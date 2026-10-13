import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GearItemHero } from "./gear-item-hero";
import type { GearItem } from "@/lib/api/gear";
import type { UnitSystem } from "@/lib/units";

const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

afterEach(() => {
  auth.units = "metric";
});

const BACK = { href: "/gear", label: "Back to gear" };

const item = (overrides: Partial<GearItem> = {}): GearItem => ({
  uuid: "item-1",
  name: "AL80",
  type: "cylinder",
  rented: false,
  is_archived: false,
  dive_count: 0,
  dive_time: 0,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const figure = (label: string) =>
  screen.queryByText(label, { selector: "dt" })?.nextElementSibling;

const AL80 = { volume: 11.1, working_pressure: 207, material: "aluminium" };

describe("GearItemHero", () => {
  it("states a cylinder's facts beside its dives and its dive time", () => {
    render(<GearItemHero back={BACK} gearItem={item(AL80)} />);

    expect(figure("Cylinder")).toHaveTextContent(
      "11.1 L · 207 bar · Aluminium",
    );
    expect(figure("Dives")).toHaveTextContent("0");
    expect(figure("Dive time")).toHaveTextContent("0min");
  });

  it("leads with the cubic feet under imperial units", () => {
    auth.units = "imperial";
    render(<GearItemHero back={BACK} gearItem={item(AL80)} />);

    expect(figure("Cylinder")?.textContent).toMatch(/^80 cu ft · 11.1 L · /);
  });

  it("states no cylinder figure for an item recording no facts", () => {
    render(<GearItemHero back={BACK} gearItem={item({ type: "regulator" })} />);

    expect(figure("Cylinder")).toBeUndefined();
  });

  it("states the dive time in hours and minutes", () => {
    render(
      <GearItemHero
        back={BACK}
        gearItem={item({ dive_count: 3, dive_time: 8100 })}
      />,
    );

    expect(figure("Dive time")).toHaveTextContent("2h 15min");
  });

  it("counts the next service down in hours of diving where only hours apply", () => {
    // Verification's own figures: every hour from 45 minutes in.
    render(
      <GearItemHero
        back={BACK}
        gearItem={item({
          dive_count: 1,
          dive_time: 2700,
          service: [
            {
              uuid: "s1",
              kind: "service",
              is_active: true,
              interval_hours: 1,
              next_due_at_dive_time: 6300,
            },
          ],
        })}
      />,
    );

    expect(figure("Next service")).toHaveTextContent("In 1 hour of diving");
  });

  it("calls an hours rule overdue once the dive time passes it", () => {
    render(
      <GearItemHero
        back={BACK}
        gearItem={item({
          dive_count: 1,
          dive_time: 7200,
          service: [
            {
              uuid: "s1",
              kind: "service",
              is_active: true,
              next_due_at_dive_time: 6300,
            },
          ],
        })}
      />,
    );

    expect(figure("Next service")).toHaveTextContent("Overdue");
  });
});
