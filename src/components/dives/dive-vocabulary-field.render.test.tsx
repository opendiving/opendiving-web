import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { Waves } from "lucide-react";
import { DiveVocabularyField } from "./dive-vocabulary-field";
import { DIVE_TYPE_LABELS } from "@/lib/api/dives";

function Harness({ stored }: { stored: string }) {
  const form = useForm<{ type: string }>({
    defaultValues: { type: stored },
  });
  return (
    <FormProvider {...form}>
      <DiveVocabularyField
        control={form.control}
        name="type"
        label="Dive type"
        icon={Waves}
        values={["open_circuit"] as const}
        labels={DIVE_TYPE_LABELS}
      />
    </FormProvider>
  );
}

const options = () =>
  [...screen.getByLabelText("Dive type").querySelectorAll("option")].map(
    (option) => option.value,
  );

describe("DiveVocabularyField", () => {
  it("offers only the values it is given", () => {
    render(<Harness stored="" />);

    expect(options()).toEqual(["", "open_circuit"]);
  });

  // A save must not drop what a stored dive already says.
  it("still offers a stored value it no longer lists", () => {
    render(<Harness stored="freedive" />);

    expect(options()).toEqual(["", "open_circuit", "freedive"]);
    expect(screen.getByLabelText("Dive type")).toHaveValue("freedive");
  });

  // The API can grow a member before this build ships its label.
  it("offers a stored value this build has no label for, de-snaked", () => {
    render(<Harness stored="sidemount" />);

    expect(options()).toEqual(["", "open_circuit", "sidemount"]);
    expect(screen.getByLabelText("Dive type")).toHaveValue("sidemount");
    expect(
      screen.getByRole("option", { name: "Sidemount" }),
    ).toBeInTheDocument();
  });
});
