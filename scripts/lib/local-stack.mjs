// What `screenshots.mjs` and `measure-navigations.mjs` share: where the local stack is,
// the browser that drives it, and signing in to it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

// Where `docker compose logs` is run. The sibling default is right in a checkout and
// wrong in a git worktree, which sits under `.claude/worktrees/` and so resolves `..`
// inside itself: name the checkout there rather than counting the levels back to it.
export const API_DIR =
  process.env.API_DIR ?? path.join(root, "..", "opendiving-api");

// Same variable the app builds its axios `baseURL` from, so it carries the `/api/v1`
// prefix and callers append only the route. Appending the prefix here as well would
// double it up for anyone who has the variable exported.
export const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// playwright-core only drives a browser, so `npm install` never downloads one: this is
// CHROME_PATH, or the usual Chrome install, or the end of the run.
export function chromePath() {
  const found = CHROME_CANDIDATES.find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!found) {
    console.error(
      "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.",
    );
    process.exit(1);
  }
  return found;
}

// Requests a magic link for `email` and reads its token back out of the API container's
// log, so this only works against a local stack whose logs you can read.
export async function magicLink(email) {
  const response = await fetch(`${API}/auth/email/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok)
    throw new Error(`magic-link request failed: ${response.status}`);

  const logs = execFileSync(
    "docker",
    ["compose", "logs", "api", "--tail", "40"],
    { cwd: API_DIR },
  ).toString();
  const token = [...logs.matchAll(/token=([A-Za-z0-9_.-]+)/g)].at(-1)?.[1];
  if (!token)
    throw new Error(`no magic-link token in the API log at ${API_DIR}`);
  return token;
}
