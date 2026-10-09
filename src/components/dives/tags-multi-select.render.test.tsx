import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TAG_NAME_MAX, type Tag } from "@/lib/api/tags";
import { TagsMultiSelect } from "./tags-multi-select";

vi.mock("@/lib/api/tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/tags")>();
  return { ...actual, fetchAllTags: vi.fn() };
});

const { fetchAllTags } = await import("@/lib/api/tags");

const tag = (uuid: string, name: string): Tag => ({
  uuid,
  name,
  dive_count: 1,
  site_count: 0,
  created_at: "2026-01-01T00:00:00Z",
});

function Picker({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <TagsMultiSelect aria-label="Tags" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const value = () =>
  JSON.parse(screen.getByTestId("value").textContent ?? "[]") as string[];
const picker = () => screen.getByRole("combobox", { name: "Tags" });

beforeEach(() => {
  vi.mocked(fetchAllTags)
    .mockReset()
    .mockResolvedValue([tag("t1", "drift"), tag("t2", "night")]);
});

describe("TagsMultiSelect", () => {
  it("offers the diver's tags, less the ones the dive already carries in any case", async () => {
    render(<Picker initial={["Night"]} />);
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalled());

    await userEvent.click(picker());

    expect(
      await screen.findByRole("option", { name: "drift" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "night" }),
    ).not.toBeInTheDocument();
  });

  it("adds a picked tag and a typed one, each once", async () => {
    render(<Picker />);
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalled());

    await userEvent.click(picker());
    await userEvent.click(await screen.findByRole("option", { name: "drift" }));
    await userEvent.type(picker(), "  giant stride {Enter}");
    await userEvent.type(picker(), "DRIFT{Enter}");

    expect(value()).toEqual(["drift", "giant stride"]);
  });

  // Each chip's button is named for its tag, the row-action rule: a field's
  // label reaches neither the controls list nor the focus announcement.
  it("names each chip's remove button for its tag, and removes only that one", async () => {
    render(<Picker initial={["night", "wreck"]} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove night" }));

    expect(value()).toEqual(["wreck"]);
    expect(
      screen.getByRole("button", { name: "Remove wreck" }),
    ).toBeInTheDocument();
  });

  it("keeps a tag past the API's bound in the field, menu shut and the reason under it", async () => {
    render(<Picker />);
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalled());
    const tooLong = "x".repeat(TAG_NAME_MAX + 1);

    await userEvent.type(picker(), `${tooLong}{Enter}`);

    expect(value()).toEqual([]);
    expect(picker()).toHaveValue(tooLong);
    expect(picker()).toHaveFocus();
    expect(picker()).toHaveAttribute("aria-expanded", "false");
    expect(picker()).toHaveAttribute("aria-invalid", "true");
    expect(picker()).toHaveAccessibleDescription(
      `A tag can be at most ${TAG_NAME_MAX} characters`,
    );

    await userEvent.type(picker(), "{Backspace}");
    expect(picker()).not.toHaveAttribute("aria-invalid");
    await userEvent.type(picker(), "{Enter}");

    expect(value()).toEqual(["x".repeat(TAG_NAME_MAX)]);
    expect(picker()).toHaveValue("");
  });

  it("still takes a typed tag when the list could not be read", async () => {
    vi.mocked(fetchAllTags).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Picker />);
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalled());

    await userEvent.type(picker(), "night{Enter}");

    expect(value()).toEqual(["night"]);
  });
});
