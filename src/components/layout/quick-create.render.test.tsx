import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickCreateProvider, useQuickCreate } from "./quick-create";

const stable = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: stable.push }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1" } }),
}));

vi.mock("@/components/trips/trip-dialog", () => ({ TripDialog: () => null }));
vi.mock("@/components/sites/dive-site-dialog", () => ({
  DiveSiteDialog: () => null,
}));
vi.mock("@/components/gear/gear-item-dialog", () => ({
  GearItemDialog: () => null,
}));
vi.mock("@/components/certifications/certification-dialog", () => ({
  CertificationDialog: () => null,
}));
vi.mock("@/components/courses/course-dialog", () => ({
  CourseDialog: () => null,
}));
// The person dialog stands in as a button that saves, so the provider's routing
// is what the test reads rather than any form.
vi.mock("@/components/people/person-dialog", () => ({
  PersonDialog: ({
    open,
    onSaved,
  }: {
    open: boolean;
    onSaved: (person: { uuid: string }) => void;
  }) =>
    open ? (
      <button onClick={() => onSaved({ uuid: "person-1" })}>Save</button>
    ) : null,
}));

function NewPerson() {
  const openCreate = useQuickCreate();
  return <button onClick={() => openCreate("person")}>New person</button>;
}

describe("QuickCreateProvider", () => {
  it("opens the created person's page, leading back to where it was made", async () => {
    render(
      <QuickCreateProvider>
        <NewPerson />
      </QuickCreateProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New person" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(stable.push).toHaveBeenCalledWith(
      "/people/person-1?from=%2Fdashboard",
    );
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
