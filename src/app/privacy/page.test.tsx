import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { tileSource } from "@/lib/map-tiles";
import PrivacyPage from "./page";

// §10's counts are prose, and prose is what goes stale. `lib/storage-keys.test.ts`
// already guarantees that every key production code writes is *listed* here; what it
// cannot see is that the sentences above the list still agree with its length -
// "Nine entries", "seven of those nine", "Two are different". One of those three is
// spelled as a word, which is how a sweep for numerals misses it.
//
// This is also where the section's conditional half is pinned. §4.8 and the Google
// storage key exist only where an instance has Google sign-in configured, so every
// count here has two correct answers rather than one, and an instance that has not
// turned Google on must not read as though it had.
const { runtimeConfig } = vi.hoisted(() => ({ runtimeConfig: vi.fn() }));
vi.mock("@/lib/runtime-config", () => ({ runtimeConfig }));

function renderPage({ google }: { google: boolean }) {
  runtimeConfig.mockReturnValue({
    tiles: tileSource(),
    googleClientId: google ? "abc.apps.googleusercontent.com" : undefined,
  });
  render(<PrivacyPage />);
}

// The `<ul>` that follows the §10.2 heading, which is the disclosure list itself.
function storageEntries(): string[] {
  const heading = screen.getByText(
    /10\.2 Preferences remembered on this device/,
  );
  const list = heading.nextElementSibling?.nextElementSibling;
  expect(list?.tagName).toBe("UL");
  return [...list!.querySelectorAll("li")].map((li) => li.textContent ?? "");
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ["with Google sign-in configured", true],
  ["without Google sign-in", false],
])("§10 %s", (_label, google) => {
  it("counts the entries it actually lists", () => {
    renderPage({ google });

    const listed = storageEntries().length;
    expect(
      screen.getByText(
        new RegExp(`${NUMBER_WORDS[listed]} entries in your browser`, "i"),
      ),
    ).toBeInTheDocument();
  });

  // The other two counts have to add up to the same total: the ones you cannot
  // switch off, plus the ones that are "different".
  it("splits that same total between what you can and cannot switch off", () => {
    renderPage({ google });

    const listed = storageEntries().length;
    const fixed = 7;
    expect(
      screen.getByText(
        new RegExp(`seven of those ${NUMBER_WORDS[listed]}, you`, "i"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`^${NUMBER_WORDS[listed - fixed]} are different`, "i"),
      ),
    ).toBeInTheDocument();
  });
});

describe("the Google half of the page", () => {
  it("discloses the sign-in attempt key only where Google is configured", () => {
    renderPage({ google: true });

    expect(
      storageEntries().some((entry) =>
        entry.includes("opendiving:google-sign-in-attempts"),
      ),
    ).toBe(true);
  });

  // Invariant: an instance that has not configured Google says nothing about
  // Google at all - no §4.8, no numbering gap where it would have been, and no
  // link off to Google's own policy.
  it("ends section 4 at 4.7 with no gap when Google is unconfigured", () => {
    renderPage({ google: false });

    expect(screen.getByText(/4\.7 Legal Requirements/)).toBeInTheDocument();
    expect(screen.queryByText(/4\.8 Signing In with Google/)).toBeNull();
    expect(screen.queryByText(/^4\.9 /)).toBeNull();
    expect(document.querySelector('a[href*="policies.google.com"]')).toBeNull();
    expect(storageEntries().some((entry) => entry.includes("google"))).toBe(
      false,
    );
  });

  // §10.4 used to name Google as one of "two outside parties [that] act on their
  // own account". After the redirect change Google sets nothing in the visitor's
  // browser on this site, so it is one party - and the sentence saying so has to
  // hold in both configurations rather than only the one that dropped the clause.
  it.each([
    ["configured", true],
    ["unconfigured", false],
  ])("names one outside party in §10.4 when Google is %s", (_label, google) => {
    renderPage({ google });

    expect(
      screen.getByText(/One outside party acts on its own account/i),
    ).toBeInTheDocument();
    // The sentence `lib/google-oauth.ts` chose `localStorage` to protect. It is an
    // affirmative negative claim, and the reason this flow does not use the
    // mechanism that would otherwise fit it better.
    expect(
      screen.getByText(/There is no session storage/i),
    ).toBeInTheDocument();
  });
});
