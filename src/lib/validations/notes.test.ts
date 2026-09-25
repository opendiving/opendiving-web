import { describe, expect, it } from "vitest";
import { NOTES_MAX_LENGTH, notesField } from "./notes";

describe("notesField", () => {
  it("is the API's cap, one figure for every record", () => {
    expect(NOTES_MAX_LENGTH).toBe(100_000);
  });

  it("takes a note exactly at the cap", () => {
    // A note imported at 20 000 characters has to stay editable through the
    // form, which is the whole reason the figure sits this high.
    expect(notesField().safeParse("a".repeat(NOTES_MAX_LENGTH)).success).toBe(
      true,
    );
  });

  it("refuses one past it, in one message", () => {
    const result = notesField().safeParse("a".repeat(NOTES_MAX_LENGTH + 1));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Notes cannot exceed 100,000 characters",
    );
  });
});
