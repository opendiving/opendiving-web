import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { tileSource } from "@/lib/map-tiles";
import PrivacyPage from "./page";

// §10's counts are prose, and prose is what goes stale. `lib/storage-keys.test.ts`
// already guarantees that every key production code writes is *listed* here; what it
// cannot see is that the sentences above and below the list still agree with its
// length - "Nine entries", "Seven of those nine are covered", "Two are not covered".
// All three are spelled as words, which is how a sweep for numerals misses every one
// of them.
//
// The split below used to be between the keys you could switch off and the ones you
// could not, and the second number was a constant because it was a fact about the
// code rather than about the list. It is now the split the device-memory switch
// makes, and the "cannot" side is empty: §10.3 offers a control that reaches every
// covered key, so the count that moved with each release is gone rather than lowered.
// The last test in this block is what holds that - a sentence claiming no control
// exists is the specific thing this section may no longer say.
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

  // The other two counts have to add up to the same total: the ones the switch
  // clears and suppresses, plus the ones it deliberately leaves alone.
  it("splits that same total between what the switch covers and what it does not", () => {
    renderPage({ google });

    const listed = storageEntries().length;
    // One constant, spelled into both regexes below: the earlier shape wrote the
    // word out in the first and the numeral in the second, which is two places for
    // the same figure to be wrong in. It does not vary with the Google
    // configuration - the key that appears and disappears with it is an excluded
    // one - so the conditional half of the page lands entirely on the remainder.
    const covered = 7;
    expect(
      screen.getByText(
        new RegExp(
          `${NUMBER_WORDS[covered]} of those ${NUMBER_WORDS[listed]} are covered`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`^${NUMBER_WORDS[listed - covered]} are not covered`, "i"),
      ),
    ).toBeInTheDocument();
  });

  // The half no count can pin. §10.3 spent a release admitting the control it
  // describes did not exist; each of these sentences was true then and is false
  // now, and re-introducing any of them is the way this section goes back to
  // being wrong about its own software.
  it.each([
    [/offers no control/i],
    [/does not yet give you one/i],
    [/cannot even be changed/i],
    [/separate piece of work already planned/i],
    [/which of these you can switch off, and which you cannot/i],
  ])("no longer says %s", (claim) => {
    renderPage({ google });

    expect(screen.queryByText(claim)).toBeNull();
  });

  // The switch itself, rather than the prose about it: §10.3 is the only surface
  // reachable without an account - `/settings` is auth-gated - so the control
  // being present here is what makes the objection available at all.
  it("renders the switch itself, not only a description of one", () => {
    renderPage({ google });

    expect(
      screen.getByRole("checkbox", {
        name: /remember display preferences on this device/i,
      }),
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
