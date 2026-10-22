import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePointer } from "@/test/pointer";
import { CreatableCombobox, type ComboboxItem } from "./creatable-combobox";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

// The sheet is a restyle of the same elements, so what can go wrong is
// behavioural: whether it opens, and whether leaving it leaves the field. Where
// it is drawn is the browser's to answer.

const TRIPS: ComboboxItem[] = [
  { id: "t1", name: "Dahab 2025" },
  { id: "t2", name: "Red Sea 2026" },
];

function Field({ keepOpenOnSelect = false }: { keepOpenOnSelect?: boolean }) {
  const [value, setValue] = useState<string | undefined>();
  return (
    <CreatableCombobox
      aria-label="Trip"
      items={TRIPS}
      value={value}
      onChange={setValue}
      keepOpenOnSelect={keepOpenOnSelect}
    />
  );
}

const box = () => screen.getByRole("combobox", { name: "Trip" });
const done = () => screen.queryByRole("button", { name: "Done" });

describe("PickerSheet", () => {
  it("opens the menu as a sheet where a finger is driving", async () => {
    usePointer("coarse");
    render(<Field />);

    await userEvent.click(box());

    expect(done()).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(box()).toHaveFocus();
  });

  it("keeps the dropdown for a mouse", async () => {
    render(<Field />);

    await userEvent.click(box());

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(done()).not.toBeInTheDocument();
  });

  it("keeps the dropdown inside a dialog", async () => {
    usePointer("coarse");
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>New site</DialogTitle>
          <Field />
        </DialogContent>
      </Dialog>,
    );

    await userEvent.click(box());

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(done()).not.toBeInTheDocument();
  });

  it("leaves the field on a pick, taking the keyboard with it", async () => {
    usePointer("coarse");
    render(<Field />);
    await userEvent.click(box());

    await userEvent.click(screen.getByRole("option", { name: "Red Sea 2026" }));

    expect(box()).toHaveValue("Red Sea 2026");
    expect(box()).not.toHaveFocus();
    expect(done()).not.toBeInTheDocument();
  });

  it("stays up across picks for an append-only field", async () => {
    usePointer("coarse");
    render(<Field keepOpenOnSelect />);
    await userEvent.click(box());

    await userEvent.click(screen.getByRole("option", { name: "Dahab 2025" }));

    expect(done()).toBeInTheDocument();
    expect(box()).toHaveFocus();
  });

  it("closes on Done, leaving the field", async () => {
    usePointer("coarse");
    render(<Field />);
    await userEvent.click(box());

    await userEvent.click(done()!);

    expect(done()).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box()).not.toHaveFocus();
  });
});
