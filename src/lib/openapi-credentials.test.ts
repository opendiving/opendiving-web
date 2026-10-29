import { describe, expect, it } from "vitest";

import {
  CREDENTIALS_EXTENSION,
  filterByCredential,
  namesCredentials,
} from "./openapi-credentials";

const allCredentials = [
  "anonymous",
  "session",
  "superuser",
  "api-key-read",
  "api-key-write",
];

const document = {
  openapi: "3.1.0",
  tags: [{ name: "dives" }, { name: "admin" }, { name: "health" }],
  paths: {
    "/api/v1/dives": {
      parameters: [{ name: "page", in: "query" }],
      get: {
        tags: ["dives"],
        [CREDENTIALS_EXTENSION]: [
          "session",
          "superuser",
          "api-key-read",
          "api-key-write",
        ],
      },
      post: {
        tags: ["dives"],
        [CREDENTIALS_EXTENSION]: ["session", "superuser", "api-key-write"],
      },
    },
    "/api/v1/admin/stats": {
      get: { tags: ["admin"], [CREDENTIALS_EXTENSION]: ["superuser"] },
    },
    "/api/v1/health": {
      get: { tags: ["health"], [CREDENTIALS_EXTENSION]: allCredentials },
    },
  },
};

describe("filterByCredential", () => {
  it("keeps only the operations a read key may call", () => {
    const filtered = filterByCredential(document, "api-key-read");

    expect(filtered.paths).toEqual({
      "/api/v1/dives": {
        parameters: document.paths["/api/v1/dives"].parameters,
        get: document.paths["/api/v1/dives"].get,
      },
      "/api/v1/health": document.paths["/api/v1/health"],
    });
  });

  it("drops the tags no remaining operation uses", () => {
    expect(filterByCredential(document, "anonymous").tags).toEqual([
      { name: "health" },
    ]);
  });

  it("drops an operation that names no credentials", () => {
    const bare = {
      paths: { "/api/v1/x": { get: {} } },
    };

    expect(filterByCredential(bare, "session").paths).toEqual({});
  });

  it("leaves the document it was given alone", () => {
    const before = JSON.stringify(document);
    filterByCredential(document, "superuser");

    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("namesCredentials", () => {
  it("is true for a document carrying the extension", () => {
    expect(namesCredentials(document)).toBe(true);
  });

  it("is false for one from an API build without it", () => {
    expect(
      namesCredentials({ paths: { "/api/v1/x": { get: { tags: [] } } } }),
    ).toBe(false);
  });
});
