import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    googleClientId: google ? "abc.apps.googleusercontent.com" : undefined,
  });
  render(<PrivacyPage />);
}

// Every list on this page that a section's own prose counts or closes over sits
// two elements after its heading: the heading, the sentence introducing the list,
// then the list. §10.2's is the disclosure list; the rest are the ones below.
function listAfterHeading(heading: RegExp): string[] {
  const found = screen.getByText(heading);
  const list = found.nextElementSibling?.nextElementSibling;
  expect(list?.tagName).toBe("UL");
  return [...list!.querySelectorAll("li")].map((li) => li.textContent ?? "");
}

function storageEntries(): string[] {
  return listAfterHeading(/10\.2 Preferences remembered on this device/);
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

// The counts and closure claims outside §10, which until server-side sessions
// arrived were pinned by nothing at all. Each of the three is a sentence that
// stops being true when a list under it grows, and each had already been written
// to be exhaustive - §2.2 counts what is recorded, §3 closes with "And nothing
// else.", §6.2 splits six rights into the ones that are buttons and the ones that
// are requests. Adding the session and audit records moved all three at once,
// which is what these pins exist to catch next time.
//
// Parameterised over both configurations like §10's, not because any of these
// sections has a Google-conditional half today, but so that one growing one is
// covered by construction rather than by somebody remembering.
describe.each([
  ["with Google sign-in configured", true],
  ["without Google sign-in", false],
])("the page's other closed lists %s", (_label, google) => {
  // §2.2 opens by counting itself, twice in one sentence: "Five things are
  // recorded ... and all five are ordinary machinery".
  it("§2.2 counts the things it says are recorded automatically", () => {
    renderPage({ google });

    const listed = listAfterHeading(
      /2\.2 Automatically Collected Information/,
    ).length;
    expect(
      screen.getByText(
        new RegExp(
          `${NUMBER_WORDS[listed]} things are recorded without you asking for them, and all ${NUMBER_WORDS[listed]} are`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
  });

  // §3's closure has no number in it, so what can be pinned is the thing that
  // makes it false: something section 2.2 records with no use listed here. The
  // two records added alongside these pins are the case in point - both are
  // collected, so both owe §3 a purpose before "And nothing else." can stand.
  it("§3 closes over a list that names why the security records are kept", () => {
    renderPage({ google });

    const uses = listAfterHeading(/3\. How We Use Your Information/).join(" ");
    expect(uses).toMatch(/signed-in devices/i);
    expect(uses).toMatch(/account security events/i);
    expect(screen.getByText(/And nothing else\./)).toBeInTheDocument();
  });

  // §6.1 is the list of what Settings can do without asking anyone, and the
  // sessions card is on it. It carries no count, so the pin is the entry.
  it("§6.1 lists signing a device out among what Settings can do", () => {
    renderPage({ google });

    expect(listAfterHeading(/6\.1 Account Control/).join(" ")).toMatch(
      /sign any of them out/i,
    );
  });

  // §6.2 splits its rights into two groups by ordinal - "The first four",
  // "The last two" - and the two have to add up to the list. The sentence also
  // now carves out what the buttons do *not* reach, which is the half that made
  // "access ... and portability are all buttons in Settings" untrue.
  it("§6.2 splits its rights into groups that add up", () => {
    renderPage({ google });

    const rights = listAfterHeading(/6\.2 Data Rights/).length;
    const split = screen.getByText(
      /The first \w+ need no request/,
    ).textContent!;

    const first = NUMBER_WORDS.indexOf(
      /The first (\w+) need no request/.exec(split)![1].toLowerCase(),
    );
    const last = NUMBER_WORDS.indexOf(
      /The last (\w+),/.exec(split)![1].toLowerCase(),
    );

    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(0);
    expect(first + last).toBe(rights);
    // And the carve-out itself, which is what stops the first group being read
    // as covering everything this copy holds about you.
    expect(split).toMatch(/is not part of the export/i);
    expect(split).toMatch(/has to be asked for/i);
  });

  // §7's two retention periods are facts about the API's own sweep, and the page
  // is the only place a diver can read them. Both, and the asymmetry between
  // them, have to survive an edit to either paragraph.
  it("§7 states both retention periods and where the erasure stops", () => {
    renderPage({ google });

    expect(screen.getByText(/after 90 days/i)).toBeInTheDocument();
    expect(screen.getByText(/after 7 days/i)).toBeInTheDocument();
    // The honest partial claim: an address the account moved off is not reached
    // by the deletion and is bounded by the sweep alone.
    expect(
      screen.getByText(/an address you later moved off are not named/i),
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
