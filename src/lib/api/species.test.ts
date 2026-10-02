import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_API_BASE_URL } from "@/lib/api-base";
import { speciesAPI, speciesPhotoUrl } from "./species";

vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

// `NEXT_PUBLIC_API_URL` is inlined by the compiler at build time, so the base
// this module composes against is fixed for the whole test run and cannot be
// varied per case by writing to `process.env` here. What these assert is
// therefore the *relationship* - that the URL is built on whatever base the
// client uses, and never on a literal `/api/v1` - which is the half that has a
// silent failure mode. The absolute-base half is what a dev build and a
// split-origin deployment exercise, and the check that settles it there is not a
// unit test at all: load a page with photos on it and confirm in the browser's
// network panel that every image request goes to this instance's API and none to
// any `wikimedia.org` host.
const BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL;

const UUID = "3f1a2b3c-0000-4000-8000-0123456789ab";
const DIGEST =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

describe("speciesPhotoUrl", () => {
  it("is null when there is no photo, so nothing renders an empty <img>", () => {
    expect(speciesPhotoUrl(UUID, null)).toBeNull();
  });

  // The picker builds `SpeciesSummary`s out of search results, which carry no
  // digest at all - undefined has to behave like null rather than composing a
  // URL ending "?v=undefined".
  it("is null when the caller's record carries no digest field", () => {
    expect(speciesPhotoUrl(UUID, undefined)).toBeNull();
  });

  it("points at the photo route on the same base the API client uses", () => {
    expect(speciesPhotoUrl(UUID, DIGEST)).toBe(
      `${BASE}/species/${UUID}/photo?v=${DIGEST.slice(0, 12)}`,
    );
  });

  // The one that would fail silently: a hard-coded `/api/v1` works in the
  // shipped same-origin topology and points at the wrong origin in a
  // split-origin build, where the image simply never loads.
  it("is built from the configured base rather than a hardcoded /api/v1", () => {
    expect(speciesPhotoUrl(UUID, DIGEST)!.startsWith(`${BASE}/`)).toBe(true);
  });

  // Cache-busting, not identification: the API ignores `v` entirely and serves
  // whatever photo the uuid names. What it buys is that a replaced photo lands
  // on a URL no browser has cached.
  it("carries a digest prefix short enough not to bloat fifty <img> tags", () => {
    const version = new URL(
      speciesPhotoUrl(UUID, DIGEST)!,
      "https://example.test",
    ).searchParams.get("v");

    expect(version).toBe(DIGEST.slice(0, 12));
    expect(DIGEST.startsWith(version!)).toBe(true);
  });

  it("gives two different photos two different URLs", () => {
    const other = `a${DIGEST.slice(1)}`;

    expect(speciesPhotoUrl(UUID, DIGEST)).not.toBe(
      speciesPhotoUrl(UUID, other),
    );
  });
});

describe("getLifeListEntry", () => {
  it("reads the caller's history with the species from its own route", async () => {
    const entry = { uuid: UUID, dive_count: 4, dive_site_count: 2 };
    get.mockResolvedValue({ data: entry });

    await expect(speciesAPI.getLifeListEntry(UUID)).resolves.toBe(entry);
    expect(get).toHaveBeenCalledWith(`/user/species/${UUID}`);
  });

  it("answers null for a species none of the caller's dives records", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(speciesAPI.getLifeListEntry(UUID)).resolves.toBeNull();
  });

  it("lets any other failure through, so it is not read as never seen", async () => {
    const failure = { response: { status: 500 } };
    get.mockRejectedValue(failure);

    await expect(speciesAPI.getLifeListEntry(UUID)).rejects.toBe(failure);
  });
});
