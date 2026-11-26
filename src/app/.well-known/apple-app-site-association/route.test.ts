import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const APP_ID = "ABCDE12345.app.opendiving.ios";
const ID = "0b9e6f52-3c1d-4e8a-9f27-5d6c4b3a2e10";
// The record pages the iOS app has a screen for, written out again rather than imported,
// so that the file's paths are checked against the list and not against themselves.
const RECORD_DIRECTORIES = [
  "sites",
  "dives",
  "trips",
  "people",
  "gear",
  "courses",
  "species",
  "import",
];

// `runtimeConfig()` memoizes, so each case needs its own module instance - see
// `src/app/robots.test.ts` for the same dance.
async function loadGet(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("./route")).GET;
}

interface Component {
  "/": string;
  "?"?: Record<string, string>;
}

async function components(): Promise<Component[]> {
  const response = await (await loadGet({ IOS_APP_ID: APP_ID }))();
  const body = await response.json();
  return body.applinks.details[0].components;
}

// Apple's matcher, as far as these patterns use it: `?` is one character and `*` any
// number. Both are let match `/` here, which only widens what a pattern is taken to
// match, so a page this says is unmatched is unmatched under the real one too.
function globMatches(pattern: string, value: string): boolean {
  const source = pattern
    .split("")
    .map((c) =>
      c === "?"
        ? "."
        : c === "*"
          ? ".*"
          : c.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${source}$`).test(value);
}

function opensInApp(all: Component[], url: string): boolean {
  const { pathname, searchParams } = new URL(url, "https://dives.example.com");
  return all.some(
    (component) =>
      globMatches(component["/"], pathname) &&
      Object.entries(component["?"] ?? {}).every(([name, pattern]) =>
        // An absent item reads as empty.
        globMatches(pattern, searchParams.get(name) ?? ""),
      ),
  );
}

// Every page and route handler under `src/app`, as a path a browser would ask for, with
// a sample value in each dynamic segment and route groups dropped.
function servedPaths(): string[] {
  const appDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  return readdirSync(appDir, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => /(^|\/)(page|route)\.tsx?$/.test(file))
    .map((file) => {
      const segments = file
        .split("/")
        .slice(0, -1)
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .map((segment) =>
          segment === "[id]"
            ? ID
            : segment.startsWith("[")
              ? "sample-1"
              : segment,
        );
      return `/${segments.join("/")}`;
    });
}

describe("GET /.well-known/apple-app-site-association", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("names the configured app for its links and for passkeys, as JSON", async () => {
    const response = await (await loadGet({ IOS_APP_ID: APP_ID }))();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const uuid = "????????-????-????-????-????????????";
    expect(await response.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: [APP_ID],
            components: [
              { "/": "/connect/?*" },
              { "/": "/auth/verify", "?": { token: "?*" } },
              { "/": "/auth/verify/", "?": { token: "?*" } },
              ...RECORD_DIRECTORIES.flatMap((directory) => [
                { "/": `/${directory}/${uuid}` },
                { "/": `/${directory}/${uuid}/` },
              ]),
            ],
          },
        ],
      },
      webcredentials: { apps: [APP_ID] },
    });
  });

  it("is a 404 where the instance names no app", async () => {
    expect((await (await loadGet())()).status).toBe(404);
    expect((await (await loadGet({ IOS_APP_ID: " " }))()).status).toBe(404);
  });

  it("is a 404, said once, for a value that is not an app id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const get = await loadGet({ IOS_APP_ID: "app.opendiving.ios" });

    expect((await get()).status).toBe(404);
    expect((await get()).status).toBe(404);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("IOS_APP_ID");
  });

  it("matches the links the app opens", async () => {
    const all = await components();

    for (const directory of RECORD_DIRECTORIES) {
      expect(opensInApp(all, `/${directory}/${ID}`)).toBe(true);
      expect(opensInApp(all, `/${directory}/${ID.toUpperCase()}/`)).toBe(true);
    }
    expect(opensInApp(all, "/connect/k3x-9q")).toBe(true);
    expect(opensInApp(all, "/auth/verify?token=abc")).toBe(true);
    expect(opensInApp(all, "/auth/verify/?token=abc&next=1")).toBe(true);
    expect(opensInApp(all, "/auth/verify")).toBe(false);
    expect(opensInApp(all, "/auth/verify?token=")).toBe(false);
  });

  // The test that moves with the tree: a page added beside or beneath a record page,
  // or anywhere else, fails here until it is either a link the app opens or unmatched.
  it("matches no other page the web serves", async () => {
    const all = await components();
    const opened = servedPaths().filter((served) => opensInApp(all, served));

    expect(opened.sort()).toEqual(
      [
        "/connect/sample-1",
        ...RECORD_DIRECTORIES.map((directory) => `/${directory}/${ID}`),
      ].sort(),
    );
    for (const served of [
      "/dives/new",
      `/dives/${ID}/edit`,
      `/import/${ID}/log`,
      "/sites/proposals",
      "/dives",
    ]) {
      expect(servedPaths()).toContain(served);
    }
  });
});
