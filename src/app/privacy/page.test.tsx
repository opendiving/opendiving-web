import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PrivacyPage from "./page";
import { PROJECT_OPERATOR } from "@/lib/operator";

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
// This is also where the section's conditional half is pinned. §4.11 and the Google
// storage key exist only where an instance has Google sign-in configured, so every
// count here has two correct answers rather than one, and an instance that has not
// turned Google on must not read as though it had.
//
// The other instance-dependent halves are the operator block, the join-link
// sentences and the map tiles, all mocked at the module that asks the API rather
// than at `fetch`: what the page branches on is the booleans that function returns,
// and staging a response body here would be testing `config.server.ts` a second time
// in the wrong file.
const { runtimeConfig, readLegalPageConfig } = vi.hoisted(() => ({
  runtimeConfig: vi.fn(),
  readLegalPageConfig: vi.fn(),
}));
vi.mock("@/lib/runtime-config", () => ({ runtimeConfig }));
vi.mock("@/lib/api/config.server", () => ({ readLegalPageConfig }));

// `await PrivacyPage()` rather than `render(<PrivacyPage />)`: the page is an async
// Server Component, and React Testing Library renders elements rather than awaiting
// them - handed the component directly it renders a promise and finds an empty page.
async function renderPage({
  google,
  projectOperated = false,
  joinLinks = false,
  mapTiles = false,
}: {
  google: boolean;
  projectOperated?: boolean;
  joinLinks?: boolean;
  mapTiles?: boolean;
}) {
  runtimeConfig.mockReturnValue({
    googleClientId: google ? "abc.apps.googleusercontent.com" : undefined,
  });
  readLegalPageConfig.mockResolvedValue({
    projectOperated,
    joinLinks,
    mapTiles,
  });
  render(await PrivacyPage());
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
  return listAfterHeading(/10\.2 Preferences Remembered on This Device/);
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
  it("counts the entries it actually lists", async () => {
    await renderPage({ google });

    const listed = storageEntries().length;
    expect(
      screen.getByText(
        new RegExp(`${NUMBER_WORDS[listed]} entries in your browser`, "i"),
      ),
    ).toBeInTheDocument();
  });

  // The other two counts have to add up to the same total: the ones the switch
  // clears and suppresses, plus the ones it deliberately leaves alone.
  it("splits that same total between what the switch covers and what it does not", async () => {
    await renderPage({ google });

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
  ])("no longer says %s", async (claim) => {
    await renderPage({ google });

    expect(screen.queryByText(claim)).toBeNull();
  });

  // The switch itself, rather than the prose about it: §10.3 is the only surface
  // reachable without an account - `/settings` is auth-gated - so the control
  // being present here is what makes the objection available at all.
  it("renders the switch itself, not only a description of one", async () => {
    await renderPage({ google });

    expect(
      screen.getByRole("switch", {
        name: /^don’t remember display preferences$/i,
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
  it("§2.2 counts the things it says are recorded automatically", async () => {
    await renderPage({ google });

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
  it("§3 closes over a list that names why the security records are kept", async () => {
    await renderPage({ google });

    const uses = listAfterHeading(/3\. How We Use Your Information/).join(" ");
    expect(uses).toMatch(/signed-in devices/i);
    expect(uses).toMatch(/account security events/i);
    // And the daily totals §2.2 counts two of those records into, which are kept
    // for a purpose of their own.
    expect(uses).toMatch(/Count how this copy is used:.*daily\s+totals/i);
    // And the one use that shows your entries to somebody else, which the closure
    // below would otherwise deny.
    expect(uses).toMatch(/whoever holds a check-in link you made/i);
    expect(screen.getByText(/And nothing else\./)).toBeInTheDocument();
  });

  // Terms §5 promises any feature that shows entries to someone else a section of
  // its own here, and the sentences in §4.1, §4.2 and §6.1 that rule sharing out have
  // to name it rather than stand as they were.
  it("gives the check-in link a section of its own, and names it where sharing is ruled out", async () => {
    await renderPage({ google });

    const heading = screen.getByText(/4\.9 Check-in Links/);
    expect(heading.tagName).toBe("H3");
    for (const pointer of [
      /no setting that makes any of it public/,
      /There are three exceptions\./,
      /nothing is public or shared, so there is\s+nothing to switch off/,
    ]) {
      expect(screen.getByText(pointer)).toHaveTextContent(/section 4\.9/i);
    }
    expect(screen.getByText(/nothing to switch off/)).toHaveTextContent(
      /Revoke/,
    );
  });

  // The link shows the address the diver entered for check-in, which is not the one
  // they sign in with, and every contact and policy rather than one of each.
  it("says a check-in link shows the check-in email, the contacts and the policies", async () => {
    await renderPage({ google });

    const shows = screen.getByText(/What a link shows:/).parentElement!;
    expect(shows).toHaveTextContent(
      /the email address you entered\s+for check-in/,
    );
    expect(shows).toHaveTextContent(
      /your insurance policies, your emergency contacts/,
    );
  });

  // Linking a person to an account is the third thing shown across accounts, and
  // the first that runs towards the diver doing it. It owes a section of its own,
  // a line in the exceptions count, and the four facts the section exists to state:
  // what the linker sees, that the account is told nothing, the identifier the
  // export carries and what it encodes, and what an import can link.
  it("gives linking a person a section of its own, and counts it among the exceptions", async () => {
    await renderPage({ google });

    const heading = screen.getByText(/4\.10 Linking a Person to an Account/);
    expect(heading.tagName).toBe("H3");
    expect(screen.getByText(/There are three exceptions\./)).toHaveTextContent(
      /section 4\.10/i,
    );
    expect(
      screen.getByText(/one of the three places in the software/),
    ).toHaveTextContent(/section 4\.10/);

    const section: string[] = [];
    for (
      let node = heading.nextElementSibling;
      node && node.tagName === "P";
      node = node.nextElementSibling
    ) {
      section.push(node.textContent ?? "");
    }
    const text = section.join(" ");
    expect(text).toMatch(/current username/);
    expect(text).toMatch(/What the account is told:\s*nothing/);
    expect(text).toMatch(/identifier/);
    expect(text).toMatch(/when that account was\s+created/);
    expect(text).toMatch(/a file you import can\s+link a person/);
    expect(text).toMatch(/every\s+person linked to it is simply unlinked/);
    // And the dive-buddy denial is gone from the paragraph that used to make it.
    expect(screen.queryByText(/There are no dive buddies/)).toBeNull();
  });

  // §6.1 is the list of what Settings can do without asking anyone, and the
  // sessions card is on it. It carries no count, so the pin is the entry.
  it("§6.1 lists signing a device out among what Settings can do", async () => {
    await renderPage({ google });

    expect(listAfterHeading(/6\.1 Account Control/).join(" ")).toMatch(
      /sign any of them out/i,
    );
  });

  // §6.2 splits its rights into two groups by ordinal - "The first four",
  // "The last two" - and the two have to add up to the list. The sentence also
  // now carves out what the buttons do *not* reach, which is the half that made
  // "access ... and portability are all buttons in Settings" untrue.
  it("§6.2 splits its rights into groups that add up", async () => {
    await renderPage({ google });

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
    expect(split).toMatch(/are not part of the export/i);
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
  it("§4.6 names every outside service contacted for species, and who contacts it", async () => {
    await renderPage({ google });

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
  it("§4.6 names importing as a second trigger for the species lookups", async () => {
    await renderPage({ google });

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
  it("§2.3 counts the ways location arrives, and the list agrees", async () => {
    await renderPage({ google });

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
  it("§6.3's action-driven group and the sentence counting it agree", async () => {
    await renderPage({ google });

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
    // notices, scheduled - not the messages in the first of them. It must not
    // follow the number above, which is the mistake that reading the two
    // sentences as one count would produce.
    expect(
      screen.getByText(/sends you three kinds of email/i),
    ).toBeInTheDocument();
  });

  // The scheduled group's twin: a paragraph per kind, each led by its name in
  // italics, between the sentence counting them and the one counting their
  // switches. A fourth reminder added to the API owes this group a paragraph, and
  // the moment it gets one both counts have to follow.
  it("§6.3's scheduled group, its paragraphs and its switches agree", async () => {
    await renderPage({ google });

    const opening = screen.getByText(/scheduled emails/i).closest("p")!;
    let listed = 0;
    for (
      let next = opening.nextElementSibling;
      next?.firstElementChild?.tagName === "EM";
      next = next.nextElementSibling
    ) {
      listed += 1;
    }
    expect(listed).toBeGreaterThan(1);
    expect(opening.textContent).toMatch(
      new RegExp(`^${NUMBER_WORDS[listed]} scheduled emails`, "i"),
    );
    expect(
      screen.getByText(
        new RegExp(`All ${NUMBER_WORDS[listed]} are on by default`, "i"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`leaves the other ${NUMBER_WORDS[listed - 1]}`, "i"),
      ),
    ).toBeInTheDocument();
  });

  // §7's retention periods are facts about the API's own sweeps, and the page is
  // the only place a diver can read them. All four, and the asymmetries between
  // them, have to survive an edit to any of the paragraphs.
  //
  // Each assertion names its own sentence rather than matching a bare "after 90
  // days": there are two 90-day sweeps on this page now, and a regex that broad
  // would fail on finding both rather than pin either.
  it("§7 states every retention period and where the erasure stops", async () => {
    await renderPage({ google });

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
    // A check-in link, swept hourly once it has stopped working, whichever way it
    // stopped.
    expect(
      screen.getByText(/is deleted by a sweep that runs\s+every hour/i),
    ).toHaveTextContent(
      /check-in link.*24 hours after you made it,\s+or sooner if you revoked it or made another/i,
    );
    // The honest partial claim: an address the account moved off is not reached
    // by the deletion and is bounded by the sweep alone.
    expect(
      screen.getByText(/an address you later moved off are not named/i),
    ).toBeInTheDocument();
  });
});

// The daily totals, which are the one counting this copy does over its records, and
// the sentences they would otherwise make false: §2.2's "none of the five above is
// counted", §7's session that goes "once it can no longer sign you in", the two
// waiting-list exits, and what an invitation records.
describe.each([
  ["with Google sign-in configured", true],
  ["without Google sign-in", false],
])("the daily totals %s", (_label, google) => {
  it("§2.2 says what is counted, that it names nobody, and where it does not hold", async () => {
    await renderPage({ google });

    expect(screen.queryByText(/No usage data is collected/)).toBeNull();
    expect(screen.queryByText(/none of the five above is counted/)).toBeNull();
    expect(
      screen.queryByText(/ordinary machinery rather than measurement/),
    ).toBeNull();

    const totals = screen.getByText(/What is counted is a set of/).textContent!;
    expect(totals).toMatch(/how many accounts\s+were created/);
    expect(totals).toMatch(/how many accounts\s+signed in/);
    expect(totals).toMatch(/how many were active/);
    expect(totals).toMatch(/No account is named in any of them/);
    expect(totals).toMatch(/on a day when only one account was created/);

    // The two records it is counted from each say so where they are described.
    const records = listAfterHeading(
      /2\.2 Automatically Collected Information/,
    ).join(" ");
    expect(records).toMatch(/total of active accounts/);
    expect(records).toMatch(/total of accounts that signed in/);
  });

  it("§7 keeps the totals for as long as the copy runs, through a deletion", async () => {
    await renderPage({ google });

    expect(
      screen.getByText(/are kept for as long as this copy runs/),
    ).toHaveTextContent(/deleting an account does not lower them/);
  });

  // The session sweep keeps a signed-out session until its day has closed, so the
  // day's count of active accounts can include it.
  it("§7 keeps a signed-out session until the day it was last used is over", async () => {
    await renderPage({ google });

    expect(
      screen.queryByText(/deleted once it can no longer sign you in/),
    ).toBeNull();
    expect(
      screen.getByText(/stops being able to sign you in/),
    ).toHaveTextContent(/kept until the end of the day it was last\s+used/);
  });

  // A pending request has a third exit, an account created for its address, and
  // an unused invitation says whether it answered one.
  it("§2.1 and §7 name every way a pending request goes", async () => {
    await renderPage({ google });

    expect(
      screen.getByText(/stored while the request is pending/),
    ).toHaveTextContent(
      /or an account is created here with that address[\s\S]*until it is used, whether it answered a request to be\s+invited/,
    );
    expect(
      screen
        .getByText(
          /Two more expire on their own where this copy is invite-only/i,
        )
        .closest("p"),
    ).toHaveTextContent(/or if an account is created with that address/);
  });
});

// Join links exist only on a copy whose API says so, and a copy without them carries
// no word about them anywhere on this page - which is also what keeps the setting
// undocumented on a self-hosted copy.
describe.each([
  ["with Google sign-in configured", true],
  ["without Google sign-in", false],
])("join links %s", (_label, google) => {
  const joinParagraph = () => screen.queryByText(/This copy also has/);

  it("appear nowhere where the API said there are none", async () => {
    await renderPage({ google, joinLinks: false });

    expect(joinParagraph()).toBeNull();
    expect(document.body.textContent).not.toMatch(/join link/i);
  });

  it("have a paragraph in §4.8 where the API said there are some", async () => {
    await renderPage({ google, joinLinks: true });

    const paragraph = joinParagraph()!;
    expect(paragraph).toHaveTextContent(/without an\s+invitation/);
    expect(paragraph).toHaveTextContent(/deleted within about a week/);
    expect(paragraph).toHaveTextContent(/never written onto your account/);
    expect(paragraph).toHaveTextContent(
      /on a day\s+when only one account was created/,
    );
    // Inside §4.8, after its heading and before §4.9's.
    const heading = screen.getByText(/4\.8 Inviting Someone to This Copy/);
    const next = screen.getByText(/4\.9 Check-in Links/);
    expect(
      heading.compareDocumentPosition(paragraph) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      paragraph.compareDocumentPosition(next) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // It moves no section's number.
    expect(screen.getByText(/4\.10 Linking a Person/)).toBeInTheDocument();
  });

  it("are counted as a door of their own in §2.2 and admitted under §3", async () => {
    await renderPage({ google, joinLinks: true });

    expect(screen.getByText(/What is counted is a set of/)).toHaveTextContent(
      /a join link, counted under where it was posted/,
    );
    expect(
      listAfterHeading(/3\. How We Use Your Information/).join(" "),
    ).toMatch(/let in whoever follows one of its join links/);
  });

  it("are named in the Google attempt's storage entry only where Google is", async () => {
    await renderPage({ google, joinLinks: true });

    const entry = storageEntries().find((row) =>
      row.includes("opendiving:google-sign-in-attempts"),
    );
    if (google) {
      expect(entry).toMatch(/if you came by a join link, which link/);
      expect(joinParagraph()).toHaveTextContent(/section 10\.2/);
    } else {
      expect(entry).toBeUndefined();
      expect(joinParagraph()).not.toHaveTextContent(/Google/);
    }
  });
});

// Who fetches a card's or a page head's map depends on whether this copy's
// server draws it, which only the API knows. Either way the two forms still
// draw their maps in the browser, and §4.4 has to say both halves on both
// copies.
describe("the map tiles", () => {
  const section = (heading: RegExp, next: RegExp) => {
    const start = screen.getByText(heading);
    const end = screen.getByText(next);
    const text: string[] = [];
    for (
      let node = start.nextElementSibling;
      node && node !== end;
      node = node.nextElementSibling
    ) {
      text.push(node.textContent ?? "");
    }
    return text.join(" ").replace(/\s+/g, " ");
  };
  const mapSection = () => section(/4\.4 Map Tiles/, /4\.5 Place Names/);

  it.each([[false], [true]])(
    "leave the forms' maps, and only those, to the browser, map tiles: %s",
    async (mapTiles) => {
      await renderPage({ google: false, mapTiles });

      const text = mapSection();
      expect(text).toMatch(
        /your browser fetches the map’s tiles directly from a third-party basemap provider/,
      );
      expect(text).toMatch(
        /the form to add or edit a dive site and the form to add or edit a trip/,
      );
      expect(text).toMatch(
        /Apart from those two, no page has your browser contact the provider/,
      );
    },
  );

  it("say the cards and the page heads show no map where this copy draws none", async () => {
    await renderPage({ google: false, mapTiles: false });

    expect(mapSection()).toMatch(
      /The cards that list your dives, trips and dive sites show no map on this copy, and nor does the head of the page of a dive, a trip or a dive site/,
    );
    expect(document.body.textContent).not.toMatch(
      /map pictures?|tiles this copy draws/i,
    );
    const rights = screen.getByText(/The first \w+ need no request/);
    expect(rights).toHaveTextContent(/Four things sit outside those buttons/);
    expect(rights).toHaveTextContent(
      /The email address you sign in with, your username and the list of signed-in devices are in Settings but are not part of the export/,
    );
  });

  it("say this server draws the cards' and the page heads' maps from shared tiles, and that they are nobody's, where it does", async () => {
    await renderPage({ google: false, mapTiles: true });

    const text = mapSection();
    expect(text).toMatch(
      /On this copy this server draws those maps rather than your browser, in tiles/,
    );
    expect(text).toMatch(
      /the provider sees this server’s address rather than yours, once for each tile rather than for each picture or each time you look/,
    );
    expect(text).toMatch(/in the list of your dive sites/);
    expect(text).toMatch(
      /the head of a dive’s, a trip’s and a dive site’s own page/,
    );
    // What sharing them gives away, and what it does not.
    expect(text).toMatch(
      /another member of this copy who timed their own requests could tell that someone here was shown a region/,
    );
    expect(text).toMatch(/though not who, and nothing of what they logged/);
    expect(text).not.toMatch(/show no map on this copy/);

    // §6.2: outside the export, and outside the deletion, because not yours.
    const rights = screen.getByText(/The first \w+ need no request/);
    expect(rights).toHaveTextContent(/Five things sit outside those buttons/);
    expect(rights).toHaveTextContent(
      /The email address you sign in with, your username and the list of signed-in devices are in Settings but are not part of the export/,
    );
    expect(rights).toHaveTextContent(
      /Nor are the map tiles section 4\.4 says this copy draws, and deleting your account leaves them too: they are not yours/,
    );
    expect(rights).toHaveTextContent(
      /kept while anyone on this copy is shown it and for 30 days after/,
    );

    // §7: how long they are kept, and that an account's deletion does not
    // touch them.
    const retention = section(
      /7\. Data Retention/,
      /8\. Where Your Data Lives/,
    );
    expect(retention).toMatch(
      /they belong to no account and are not deleted with one: a tile this server has not been asked for in 30 days is deleted/,
    );
    expect(retention).toMatch(
      /the files you uploaded are unlinked from disk with them/,
    );
    expect(retention).not.toMatch(/map pictures?/i);

    // §8: where they are.
    expect(
      screen.getByText(/one copy of OpenDiving is one database/),
    ).toHaveTextContent(
      /The files volume also holds the map tiles this copy draws, which are drawn from the map alone and are nobody’s/,
    );
    expect(document.body.textContent).not.toMatch(/map pictures?/i);
  });

  it("are named in the operator block's answers only where this copy draws them", async () => {
    const answers = () => {
      const block = screen
        .getByRole("heading", { name: /Who Runs This Copy/ })
        .closest("section")!;
      return (block.textContent ?? "").replace(/\s+/g, " ");
    };

    await renderPage({ google: false, projectOperated: true });
    expect(answers()).toMatch(
      /the app, the API, the background worker, the Postgres database/,
    );
    expect(answers()).toMatch(/the app, the API and the worker reach/);
    expect(answers()).not.toMatch(/map (renderer|tiles)/i);

    cleanup();
    await renderPage({
      google: false,
      projectOperated: true,
      mapTiles: true,
    });
    expect(answers()).toMatch(
      /the background worker, the map renderer §4\.4 describes, the Postgres database/,
    );
    expect(answers()).toMatch(
      /So are the map tiles §4\.4 says this copy draws, which are drawn from the map alone and are nobody’s/,
    );
    expect(answers()).toMatch(
      /the app, the API, the worker and the map renderer reach/,
    );
  });
});

describe("the Google half of the page", () => {
  it("discloses the sign-in attempt key only where Google is configured", async () => {
    await renderPage({ google: true });

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
  // These assertions are rewritten, not renumbered, each time an unconditional
  // section arrives before Google: after a shift the old ones would pass while
  // pinning nothing, since a query for Google under its old number finds nothing
  // whether or not the page is right. What is pinned is the set: §4.8 is the
  // invitations section, §4.9 the check-in links and §4.10 linking a person, all
  // always here, and Google is §4.11 and is here only when it is configured.
  it("ends section 4 at 4.10 with no gap when Google is unconfigured", async () => {
    await renderPage({ google: false });

    expect(screen.getByText(/4\.7 Legal Requirements/)).toBeInTheDocument();
    expect(
      screen.getByText(/4\.8 Inviting Someone to This Copy/),
    ).toBeInTheDocument();
    expect(screen.getByText(/4\.9 Check-in Links/)).toBeInTheDocument();
    expect(
      screen.getByText(/4\.10 Linking a Person to an Account/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/4\.11 Signing In with Google/)).toBeNull();
    expect(screen.queryByText(/^4\.1[1-9] /)).toBeNull();
    expect(document.querySelector('a[href*="policies.google.com"]')).toBeNull();
    expect(storageEntries().some((entry) => entry.includes("google"))).toBe(
      false,
    );
  });

  it("numbers Google 4.11, after the linking section, where it is configured", async () => {
    await renderPage({ google: true });

    expect(
      screen.getByText(/4\.8 Inviting Someone to This Copy/),
    ).toBeInTheDocument();
    expect(screen.getByText(/4\.9 Check-in Links/)).toBeInTheDocument();
    expect(
      screen.getByText(/4\.10 Linking a Person to an Account/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/4\.11 Signing In with Google/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/4\.10 Signing In with Google/)).toBeNull();
  });

  // §10.4 used to name Google as one of "two outside parties [that] act on their
  // own account". After the redirect change Google sets nothing in the visitor's
  // browser on this site, so it is one party - and the sentence saying so has to
  // hold in both configurations rather than only the one that dropped the clause.
  it.each([
    ["configured", true],
    ["unconfigured", false],
  ])(
    "names one outside party in §10.4 when Google is %s",
    async (_label, google) => {
      await renderPage({ google });

      expect(
        screen.getByText(/One outside party acts on its own account/i),
      ).toBeInTheDocument();
      // The sentence `lib/google-oauth.ts` chose `localStorage` to protect. It is an
      // affirmative negative claim, and the reason this flow does not use the
      // mechanism that would otherwise fit it better.
      expect(
        screen.getByText(/There is no session storage/i),
      ).toBeInTheDocument();
    },
  );
});

// The operator block, and the invariant that matters more than anything in it: a copy
// the OpenDiving project does not run must not grow a sentence about Render, a person's
// name, or an address. Both halves are asserted here because only one of them can be
// read off the page in front of you - the presence half is visible in a browser, the
// absence half is visible nowhere and is the one that would ship.
//
// The absence is asserted string by string rather than by a DOM snapshot. A snapshot of
// a page this size is 60 kB of committed HTML that every copy edit churns, which is a
// diff nobody reads and therefore a guard nobody keeps; this list fails with the name of
// the leaked string instead. Each entry is a word only the block can put on the page -
// the providers §4.3 leaves unnamed, the basemap and geocoders §4.4 and §4.5 leave
// unnamed, the operator's own three facts, and the block's heading.
const OPERATOR_ONLY = [
  "Who Runs This Copy",
  PROJECT_OPERATOR.name,
  PROJECT_OPERATOR.contactEmail,
  PROJECT_OPERATOR.jurisdiction,
  "Render",
  "Frankfurt",
  "Cloudflare",
  "Resend",
  "OpenFreeMap",
  "Nominatim",
  "Photon",
  "komoot",
  "AES-256",
  "Article 8",
];

describe("the operator block", () => {
  it.each([
    ["with Google sign-in configured", true],
    ["without Google sign-in", false],
  ])(
    "says nothing of any operator's deployment on a copy the project does not run, %s",
    async (_label, google) => {
      await renderPage({ google, projectOperated: false });

      const text = document.body.textContent ?? "";
      for (const leaked of OPERATOR_ONLY) {
        expect(text).not.toContain(leaked);
      }
    },
  );

  // The other half of "iff": nothing short of the API answering `true` earns it, and a
  // failed read is `false` at the module this mocks, so that case renders as here.
  it("appears only where the API said the project operates this instance", async () => {
    await renderPage({ google: false, projectOperated: false });
    expect(
      screen.queryByRole("heading", { name: /Who Runs This Copy/ }),
    ).toBeNull();

    // Both renderings in one test on purpose - "iff" is a claim about the pair - which
    // means unmounting the first by hand rather than waiting for the automatic cleanup
    // between tests.
    cleanup();
    await renderPage({ google: false, projectOperated: true });
    expect(
      screen.getByRole("heading", { name: /Who Runs This Copy/ }),
    ).toBeInTheDocument();
  });

  it("names the operator, an address that reaches them, and their jurisdiction", async () => {
    await renderPage({ google: false, projectOperated: true });

    expect(screen.getByText(PROJECT_OPERATOR.name)).toBeInTheDocument();
    expect(
      document.querySelector(
        `a[href="mailto:${PROJECT_OPERATOR.contactEmail}"]`,
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(
        new RegExp(
          `operated by[\\s\\S]*in\\s+${PROJECT_OPERATOR.jurisdiction}`,
        ),
      ),
    ).toBeInTheDocument();
  });

  // §5 lists four things "the software cannot promise on an operator's behalf", and the
  // block exists to answer them rather than to decorate the page. One assertion per
  // question, so that dropping any single answer fails with which one went.
  // Matched inside the block rather than on the page: §5 asks these questions in the
  // same words the block answers them in, so a page-wide query finds both and says only
  // that the section it came from still exists.
  it.each([
    ["traffic in transit", /Whether traffic is encrypted in transit — §5/],
    ["the disks at rest", /Whether the disks are encrypted at rest — §5/],
    ["administrative access", /Who has administrative access — §5/],
    ["backups", /What logs and backups exist, and for how long/],
  ])("answers §5's question about %s", async (_label, question) => {
    await renderPage({ google: false, projectOperated: true });

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;
    expect(block).toHaveTextContent(question);
  });

  // The facts that are somebody else's statement rather than this page's promise, and
  // the sub-processors §4.3 and §8 can only describe in the abstract.
  it("names where the data sits, who holds it, and whose encryption claim it is", async () => {
    await renderPage({ google: false, projectOperated: true });

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(/Render, in its Frankfurt region/);
    expect(block).toHaveTextContent(/Cloudflare R2/);
    expect(block).toHaveTextContent(/EU jurisdiction/);
    expect(block).toHaveTextContent(/Resend/);
    // The one thing about Resend that is a transfer rather than a region.
    expect(block).toHaveTextContent(/stored in the United States regardless/);
    expect(block).toHaveTextContent(/OpenFreeMap/);
    expect(block).toHaveTextContent(/Nominatim names a spot/);
    expect(block).toHaveTextContent(/Photon, run by komoot GmbH in Germany/);
    // Reported as the providers' statements, not promised by this page.
    expect(block).toHaveTextContent(
      /their statement reported rather than a promise/,
    );
  });

  // The two numbers §7 and §9 turn on. Both are arithmetic a reader can check, and both
  // are the kind of prose that goes stale silently.
  it("shows that deletion finishes inside §7's 30 days, and states this copy's age", async () => {
    await renderPage({ google: false, projectOperated: true });

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(/14-day grace period/);
    expect(block).toHaveTextContent(/3 days/);
    expect(block).toHaveTextContent(/Seventeen days at the outside/);
    expect(block).toHaveTextContent(/minimum age on this copy/);
    expect(block).toHaveTextContent(/Sixteen/);
  });

  // Four sections invite the reader to check this page against public source, and since
  // 2026-09-12 that invitation is open. The answer still has to keep the operator's route
  // beside it, because a public repository is the project's source and not proof of what
  // this copy runs. §5 is the one that reads as a bullet rather than as a section-length
  // invitation, which is how it was missed when this answer was first written as
  // "§1, §11, §12" - so it is named here by its own words.
  it("covers every section that sends the reader to public source, §5 included", async () => {
    await renderPage({ google: false, projectOperated: true });

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(/§1, §5, §11, §12/);
    expect(block).toHaveTextContent(
      /the source is public, so these claims can be checked/,
    );
    // `toHaveTextContent` reads rendered text, so the entity is already a curly
    // apostrophe by the time it is matched - hence the character rather than `&rsquo;`.
    expect(block).toHaveTextContent(
      /that invitation is open: the project’s\s+repositories are public/,
    );
    expect(block).toHaveTextContent(/the operator’s route stands beside it/);
  });

  // The sections whose own prose would otherwise dangle. Each gets one pointer, and the
  // pointer is what makes the block findable from the paragraph that needs it.
  it.each([
    ["§5", /On this copy all four are answered rather than declined/],
    ["§8", /On this copy you need ask nobody/],
    ["§9", /its minimum\s+age is 16/],
    ["§13", /On this copy they are named rather than described/],
  ])("points %s at the block", async (_label, pointer) => {
    await renderPage({ google: false, projectOperated: true });

    expect(screen.getByText(pointer)).toBeInTheDocument();
  });
});

// The one fact on this page that is a date rather than a claim, and the only one nothing
// else here would notice going stale: every other assertion in this file reads a
// sentence, and a month is not a sentence. Pinned in both renderings because the block
// must not be able to move it.
describe("the date on this page", () => {
  it.each([[false], [true]])(
    "states the month this page was last revised, project-operated: %s",
    async (projectOperated) => {
      await renderPage({ google: false, projectOperated });

      expect(
        screen.getByText(/Last updated: October 2026/),
      ).toBeInTheDocument();
    },
  );
});
