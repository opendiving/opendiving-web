import { describe, it, expect } from "vitest";
import { MAX_DIVE_FILE_SIZE } from "./dives";

describe("MAX_DIVE_FILE_SIZE", () => {
  it("matches the API's own limit", () => {
    // Mirrored from `services/dive_files.py::MAX_DIVE_FILE_SIZE`. A larger
    // value here would let the client start an upload the API will reject.
    expect(MAX_DIVE_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});
