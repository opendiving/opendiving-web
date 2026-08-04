import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./error";

function axiosErrorWithDetail(detail: unknown) {
  return { response: { data: { detail } } };
}

describe("getApiErrorMessage", () => {
  it("returns a plain string detail as-is", () => {
    const error = axiosErrorWithDetail("Username already exists");
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "Username already exists",
    );
  });

  it("falls back when the string detail is empty/whitespace", () => {
    const error = axiosErrorWithDetail("   ");
    expect(getApiErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("formats a FastAPI/Pydantic 422 validation error array", () => {
    const error = axiosErrorWithDetail([
      {
        type: "missing",
        loc: ["body", "name"],
        msg: "Field required",
        input: null,
      },
    ]);
    expect(getApiErrorMessage(error, "fallback")).toBe("name: Field required");
  });

  it("joins multiple validation errors with a semicolon", () => {
    const error = axiosErrorWithDetail([
      { loc: ["body", "name"], msg: "Field required" },
      { loc: ["body", "email"], msg: "Invalid email" },
    ]);
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "name: Field required; email: Invalid email",
    );
  });

  it("strips the leading 'body' segment from the field path", () => {
    const error = axiosErrorWithDetail([
      { loc: ["body", "mixtures", 0, "volume"], msg: "must be positive" },
    ]);
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "mixtures.0.volume: must be positive",
    );
  });

  it("falls back to just the message when loc is missing", () => {
    const error = axiosErrorWithDetail([{ msg: "Something went wrong" }]);
    expect(getApiErrorMessage(error, "fallback")).toBe("Something went wrong");
  });

  it("returns the fallback for an empty detail array", () => {
    const error = axiosErrorWithDetail([]);
    expect(getApiErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("returns the fallback when there is no response data at all", () => {
    expect(getApiErrorMessage(new Error("network error"), "fallback")).toBe(
      "fallback",
    );
  });

  it("returns the fallback for null/undefined errors", () => {
    expect(getApiErrorMessage(null, "fallback")).toBe("fallback");
    expect(getApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
