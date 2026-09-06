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
// This is also where the section's conditional half is pinned. §4.9 and the Google
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
      screen.getByRole("switch", {
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

  // §4.6 is a census of the outside services the *server* contacts on the
  // diver's behalf for species, and it had no pin at all until species photos
  // added the third one. The section is prose rather than a list, so there is no
  // length to count; what is pinned instead is the thing that makes the census
  // false - a service contacted with nothing said about it, which is exactly how
  // this section was wrong the moment photos shipped and before it was rewritten.
  //
  // The last two assertions are the ones that carry the disclosure rather than
  // the naming. Hotlinking was rejected *partly* to avoid telling divers their
  // browser talks to Wikimedia, so a page that named Commons and left out where
  // the bytes are served from would be a worse statement than the one it
  // replaced, not a better one.
  it("§4.6 names every outside service contacted for species, and who contacts it", () => {
    renderPage({ google });

    // The two registers the picker's search asks. Still exactly two - Commons is
    // asked for a file, never for the typed search string - which is why this
    // sentence keeps its count.
    expect(
      screen.getByText(/It asks two public registers/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/World Register of Marine Species/),
    ).toBeInTheDocument();

    // The third service, and the two facts that make naming it honest: the
    // bytes are stored here, and the browser never reaches Wikimedia itself.
    expect(screen.getByText(/Wikimedia Commons/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /stored on this copy of OpenDiving and served from here/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your browser never contacts Wikimedia/),
    ).toBeInTheDocument();
  });

  // The *trigger* half of §4.6, which had no pin at all and went stale the moment
  // logbook import shipped: the section used to tie every one of those outside
  // requests to the species picker, and import reaches all three services with no
  // picker involved. The test above asserts only *which* services are named, so
  // nothing failed when *when* became wrong - the exact shape of staleness this
  // page keeps producing, and the reason these are separate assertions.
  it("§4.6 names importing as a second trigger for the species lookups", () => {
    renderPage({ google });

    // A logbook file reaching the registers without a picker.
    expect(
      screen.getByText(/without a picker being involved at all/i),
    ).toBeInTheDocument();

    // The Commons request has the same two triggers, not just the picker's one.
    expect(
      screen.getByText(
        /whether the species came from the\s+picker or from a file you imported/i,
      ),
    ).toBeInTheDocument();

    // And the "nothing is sent" promise now has to survive both doors being shut,
    // not only the picker's.
    const nothingSent = screen.getByText(
      /If you never open the species picker/i,
    ).textContent!;
    expect(nothingSent).toMatch(/never import a file naming marine life/i);
    expect(nothingSent).toMatch(/nothing is sent\s+at\s+all/i);
  });

  // §2.3 and §4.4 are closed enumerations of how coordinates arrive, and a
  // closed enumeration is exactly what an import falsifies quietly: a document
  // can carry positions with no dive-computer file and no pin-dropping involved.
  // §2.3 counts its ways in words, so the count and the list have to agree.
  it("§2.3 counts the ways location arrives, and the list agrees", () => {
    renderPage({ google });

    const sentence = screen.getByText(
      /Location reaches this server \w+ ways/,
    ).textContent!;
    const claimed = NUMBER_WORDS.indexOf(
      /Location reaches this server (\w+) ways/
        .exec(sentence)![1]
        .toLowerCase(),
    );

    expect(claimed).toBeGreaterThan(0);
    expect(listAfterHeading(/2\.3 Location Information/)).toHaveLength(claimed);
  });

  // §6.3 had no pin at all until the invitation email became its fourth
  // action-driven message, and the sentence that counts them - "Only the last of
  // those three is sent to your account's own address" - was exactly the kind of
  // prose `DECISIONS.md` §"§6.3 enumerates every email" warns about: a closed
  // count with nothing behind it, one repo away from the thing it counts.
  //
  // What is checkable from here is the correspondence *within* the section: the
  // group lists N messages and the sentence under it says N. Whether N is the
  // number of senders the API actually has still cannot be checked here, and the
  // rule in DECISIONS.md remains the guard for that half.
  it("§6.3's action-driven group and the sentence counting it agree", () => {
    renderPage({ google });

    const group = screen
      .getByText(/Emails that follow an action on this site/i)
      .closest("p")!;
    // The messages are semicolon-separated in one sentence, so the count is one
    // more than the separators. A pin, not a parser: a message description that
    // grew a semicolon of its own would fail this loudly, which is the right way
    // round for prose nobody else is watching.
    const listed = (group.textContent!.match(/;/g)?.length ?? 0) + 1;
    expect(
      screen.getByText(
        new RegExp(
          `Only one of those ${NUMBER_WORDS[listed]} is sent to your account`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`The other ${NUMBER_WORDS[listed - 1]}`, "i"),
      ),
    ).toBeInTheDocument();

    // And the section's opening counts *groups* - action-driven, security
    // notices, one scheduled - not the messages in the first of them. It must not
    // follow the number above, which is the mistake that reading the two
    // sentences as one count would produce.
    expect(
      screen.getByText(/sends you three kinds of email/i),
    ).toBeInTheDocument();
  });

  // §7's retention periods are facts about the API's own sweeps, and the page is
  // the only place a diver can read them. All four, and the asymmetries between
  // them, have to survive an edit to any of the paragraphs.
  //
  // Each assertion names its own sentence rather than matching a bare "after 90
  // days": there are two 90-day sweeps on this page now, and a regex that broad
  // would fail on finding both rather than pin either.
  it("§7 states every retention period and where the erasure stops", () => {
    renderPage({ google });

    // The two audit tiers, and the reason they differ.
    expect(
      screen.getByText(/entries tied to an account after 90 days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/from before any account existed, after 7 days/i),
    ).toBeInTheDocument();
    // The two invitation-side sweeps, which hold an address belonging to
    // somebody who may have no account here at all. Read off the paragraph
    // rather than by `getByText` per sentence: both periods are 90 days and the
    // phrase appears in §2.1 as well, so only the paragraph itself is unique.
    const invitations = screen
      .getByText(/Two more expire on their own where this copy is invite-only/i)
      .closest("p")!;
    expect(invitations).toHaveTextContent(
      /request to be invited.{0,20}is kept for up to 90 days from when it was made/i,
    );
    expect(invitations).toHaveTextContent(
      /invitation nobody has used.{0,20}is kept for up to 90 days from when it was sent/i,
    );
    // And the one that is deliberately never swept, because it belongs to two
    // accounts by then.
    expect(invitations).toHaveTextContent(/was used is not swept/i);
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
  // Google at all - no Google subsection, no numbering gap where it would have
  // been, and no link off to Google's own policy.
  //
  // These two assertions moved when the invitations disclosure took §4.8 and
  // Google inherited §4.9, and *rewriting* them was the point rather than
  // renumbering them: after the shift both of the old ones would have passed
  // while pinning nothing at all. With Google unconfigured there is still no
  // "4.9" heading, and "4.8" is no longer Google's, so a `queryByText(/4\.8
  // Signing In with Google/)` returning null would have said only that a
  // heading which no longer exists under that number does not exist. What is
  // pinned now is the pair: §4.8 is the invitations section and is always here,
  // and Google is §4.9 and is here only when it is configured.
  it("ends section 4 at 4.8 with no gap when Google is unconfigured", () => {
    renderPage({ google: false });

    expect(screen.getByText(/4\.7 Legal Requirements/)).toBeInTheDocument();
    expect(
      screen.getByText(/4\.8 Inviting Someone to This Copy/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/4\.9 Signing In with Google/)).toBeNull();
    expect(screen.queryByText(/^4\.10 /)).toBeNull();
    expect(document.querySelector('a[href*="policies.google.com"]')).toBeNull();
    expect(storageEntries().some((entry) => entry.includes("google"))).toBe(
      false,
    );
  });

  it("numbers Google 4.9, after the invitations section, where it is configured", () => {
    renderPage({ google: true });

    expect(
      screen.getByText(/4\.8 Inviting Someone to This Copy/),
    ).toBeInTheDocument();
    expect(screen.getByText(/4\.9 Signing In with Google/)).toBeInTheDocument();
    expect(screen.queryByText(/4\.8 Signing In with Google/)).toBeNull();
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
