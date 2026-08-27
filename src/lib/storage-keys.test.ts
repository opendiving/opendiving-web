import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The rule: a browser-storage key that production code writes owes §10 of the privacy
// page a row in the same change. Prose said so first and prose is what failed -
// `opendiving:entry-units` shipped a ninth key while §10 still described eight, and
// nobody read the standing rule in DECISIONS.md on the way past. This is that rule with
// teeth, in three checks that are deliberately dumb:
//
//   1. every `opendiving:`-prefixed string literal in production code under `src/`
//      appears verbatim in `app/privacy/page.tsx`;
//   2. the set of production modules that write browser storage is exactly the set
//      listed below - so storage cannot appear in a new module without this test
//      failing and sending whoever added it to §10;
//   3. the two mechanisms §10.4 names that check (2) cannot see - IndexedDB and
//      service workers - are in fact unused. §10.4's third, session storage, is
//      covered by check (2) instead; see the note on `ABSENT_MECHANISMS` for why.
//
// Check (2) is a tripwire, not an analysis, and that is a correction rather than a
// shortcut. It began as a regex that read `setItem("literal")`, which missed the house
// style (every key here is a module-level constant passed by name); the fix for that
// resolved `const NAME = "string"` bindings tree-wide, and review then found four ways
// that machinery was wrong - a flat unscoped map masking a real key when two modules
// share a const name, the same map falsely accusing a file when a name collided with a
// local, a template literal being read as an offender, and the whole check passing
// green if either regex ever stopped matching. Resolving identifiers is type-graph work
// and regexes are the wrong tool for it. A list of filenames is none of those four
// things wrong: it never masks a key behind a name collision, never accuses a file over
// one, and cannot pass vacuously - the expected list is non-empty, so a broken walk
// fails rather than skips. What it protects is the thing that matters here: a module
// that did not write browser storage before cannot start without this failing.
//
// Scoped to production code anywhere under `src/`, not to `src/lib/`. Every key happens
// to live there today, but nothing requires it to, so a key added under `src/hooks/`,
// `src/contexts/` or a component would slip a narrower guard silently - the exact
// failure this exists to close.
//
// **What it still cannot see**, stated plainly rather than left as a silent hole, since
// a guard trusted past its reach is worse than one nobody trusts:
//
//   - `theme`, which belongs to next-themes and is configured in `app/layout.tsx`
//     without a `storageKey` override, so there is no literal in this tree to find. §10
//     lists it by hand; if that provider ever grows an explicit key, this covers it for
//     free.
//   - a key assembled at run time (`PREFIX + name`, a value read from config), because
//     no single literal spells it and check (1) has nothing to match. Check (2) does not
//     close this either; it only guarantees that the module doing it is one somebody
//     already had to think about.
//   - a *second* key added inside a module already on the list below, if it is named
//     without the `opendiving:` prefix. Check (1) catches it whenever the prefix is
//     used, which is the house style in all eight of these files.
//   - a storage write spelled in some way `STORAGE_WRITE` does not list. It targets the
//     three forms this app actually uses or could slip into - `setItem`, the index form,
//     `document.cookie` - and it is a text match over source, not a semantic one, so it
//     claims no completeness beyond those three. Check (3) covers two of the mechanisms
//     §10.4 names, IndexedDB and service workers; anything beyond both is genuinely
//     unseen.
//   - storage set by the *server*, which is a different mechanism entirely: the
//     `refresh_token` cookie arrives as a `Set-Cookie` header forwarded by
//     `lib/api-proxy.ts`, is `HttpOnly` so client code could not write it anyway, and
//     is disclosed by hand in §10.1.
//   - the mirror of that: check (2) reads raw text, so a production file that merely
//     *mentions* one of those forms in a comment counts as a writer and fails the
//     equality. That is a false positive, and it is the deliberate trade - stripping
//     comments correctly is parsing, which is the work this check was cut back to avoid.
//     The fix, if it ever fires, is to add the file to the list or reword the comment.

// Every production module that writes browser storage. Adding an entry is the moment to
// ask what §10 now has to say; that prompt is the entire point of the list.
const STORAGE_WRITERS = [
  "lib/auth-redirect.ts",
  "lib/chart-series-view.ts",
  "lib/dive-activity-view.ts",
  "lib/entry-units.ts",
  "lib/gas-use-view.ts",
  "lib/google-oauth.ts",
  "lib/last-auth-method.ts",
  "lib/passkey-nudge.ts",
];

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVACY_PAGE = path.join(SRC, "app", "privacy", "page.tsx");

// A quoted `opendiving:`-prefixed literal, in any of the three JS string forms.
// The suffix is `+` rather than `*` on purpose: `*` also matches a bare
// `` `opendiving:` `` written in a comment, and since every real key starts with
// that string, the resulting assertion passes against any page at all - a test case
// that cannot fail, quietly diluting the ones that can.
const KEY_LITERAL = /(['"`])(opendiving:[^'"`]+)\1/g;

// A write to browser storage from client code. `setItem` is how all eight writers do
// it; the index and cookie forms are here because they are real writes that spell no
// `setItem` at all, and neither appears in production code today - they are matched so
// that reaching for one is not a way around the list.
//
// Both of those alternatives insist on an actual assignment, which is fiddlier than it
// looks and was wrong on the first attempt: a bare `localStorage\[` also matches a
// *read* (`const x = localStorage[key]`), and a bare `=` after `document.cookie` also
// matches `document.cookie === x`, a comparison. Either would report a module that only
// reads as a writer. Hence the `\]\s*=` and the `(?!=)`.
const STORAGE_WRITE =
  /\.setItem\(|(?:local|session)Storage\[[^\]]*\]\s*=(?!=)|document\.cookie\s*=(?!=)/;

// §10.4 does not merely omit these - it states outright that this app has "no IndexedDB
// database and no service worker". That is an affirmative claim on a page whose whole
// point is that its claims are true, so it gets a check rather than an assurance.
// `cookieStore` rides along: it is not named on the page, but it is a storage write that
// spells none of `STORAGE_WRITE`, and the cheapest moment to notice it is now.
//
// `sessionStorage` is deliberately absent from this pattern even though §10.4 names it
// too. Three production modules mention it in comments - `lib/auth-redirect.ts` and
// `lib/gas-use-view.ts` explaining why they chose `localStorage` over it, and
// `lib/api/client.ts` explaining why the access token is in neither - so matching raw
// text would fail on all three for saying nothing at all. Its *writes* are caught by
// `STORAGE_WRITE` above, which is the half that matters.
const ABSENT_MECHANISMS = /\bindexedDB\b|\bserviceWorker\b|\bcookieStore\b/i;

function isProductionSource(file: string): boolean {
  return /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file);
}

function productionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `src/test/` is shared test scaffolding rather than shipped code - its
      // storage stub is not a key anyone stores anything under.
      return entry.name === "test" && dir === SRC
        ? []
        : productionSources(full);
    }
    // The privacy page is the disclosure surface, never a definition site. Sweeping
    // it too would let a key satisfy this invariant by appearing *only* there, and
    // would misreport every key as defined on the page, since `src/app/` is walked
    // before `src/lib/`.
    if (full === PRIVACY_PAGE) return [];
    return isProductionSource(entry.name) ? [full] : [];
  });
}

function storageKeysIn(files: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [, , key] of source.matchAll(KEY_LITERAL)) {
      if (!found.has(key)) {
        found.set(key, path.relative(SRC, file));
      }
    }
  }
  return found;
}

describe("browser storage keys", () => {
  const keys = storageKeysIn(productionSources(SRC));
  const privacyPage = readFileSync(PRIVACY_PAGE, "utf8");

  // Without this the whole suite passes vacuously the day the walk above breaks -
  // a rename of `src/`, a thrown `readdirSync`, a regex that stops matching - and
  // a guard that cannot fail is worse than none, because it reads as coverage.
  it("finds the keys at all", () => {
    expect(keys.size).toBeGreaterThan(0);
    expect(privacyPage.length).toBeGreaterThan(0);
  });

  it.each([...keys].map(([key, file]) => ({ key, file })))(
    "$key is disclosed on the privacy page (defined in $file)",
    ({ key }) => {
      expect(privacyPage).toContain(key);
    },
  );

  // The other half. A key named without the `opendiving:` prefix never enters the
  // sweep above at all, so the disclosure check would pass while the key shipped
  // undisclosed - and nothing else in this repo requires the prefix: no lint rule,
  // nothing in AGENTS.md. This does not police names; it makes the *arrival* of
  // browser storage in a new module impossible to do quietly.
  it("writes browser storage only from the modules already accounted for", () => {
    const writers = productionSources(SRC)
      .filter((file) => STORAGE_WRITE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file))
      .sort();
    expect(writers).toEqual(STORAGE_WRITERS);
  });

  // §10.4 claims these are absent, which is a stronger thing to say than "undisclosed"
  // and so worth holding to. A module reaching for one of them makes that sentence
  // false, and check (2) would not notice because none of them spells a `setItem`.
  it("uses none of the storage mechanisms §10.4 says it does not", () => {
    const users = productionSources(SRC)
      .filter((file) => ABSENT_MECHANISMS.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(users).toEqual([]);
  });
});
