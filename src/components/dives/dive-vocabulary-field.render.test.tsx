import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { Waves } from "lucide-react";
import { DiveVocabularyField } from "./dive-vocabulary-field";
import { DIVE_TYPE_LABELS, type DiveType } from "@/lib/api/dives";

function Harness({ stored }: { stored: DiveType | "" }) {
  const form = useForm<{ type: DiveType | "" }>({
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
});
