import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TermsPage from "./page";
import { PROJECT_OPERATOR } from "@/lib/operator";

// This page had no test at all until it grew something conditional. Everything on it was
// prose with one rendering, and prose with one rendering is what review reads; a second
// rendering is what review does not, because only one of the two is in front of you.
//
// So this file pins the pair rather than the page: on a copy the OpenDiving project does
// not run these Terms read exactly as they always have, and on one it does they carry an
// operator block and nothing else moves.
const { readLegalPageConfig } = vi.hoisted(() => ({
  readLegalPageConfig: vi.fn(),
}));
vi.mock("@/lib/api/config.server", () => ({ readLegalPageConfig }));

// `await TermsPage()`: an async Server Component is a function returning a promise, and
// handing the component to `render` renders the promise instead of the page.
async function renderPage(
  projectOperated: boolean,
  joinLinks = false,
  commonsPrimary = false,
) {
  readLegalPageConfig.mockResolvedValue({
    projectOperated,
    joinLinks,
    commonsPrimary,
  });
  render(await TermsPage());
}

// Words only the operator block can put on this page. Asserted as absences rather than
// captured in a DOM snapshot, for the reason `privacy/page.test.tsx` gives beside its own
// copy of this list: a snapshot of a page this size is churn nobody reads, and a failure
// here names the string that leaked.
const OPERATOR_ONLY = [
  "Who Runs This Copy",
  PROJECT_OPERATOR.name,
  PROJECT_OPERATOR.contactEmail,
  PROJECT_OPERATOR.jurisdiction,
  "closed beta",
  "github.com/opendiving",
  "/api/v1/health",
];

describe("the operator block", () => {
  it("says nothing of any operator on a copy the project does not run", async () => {
    await renderPage(false);

    const text = document.body.textContent ?? "";
    for (const leaked of OPERATOR_ONLY) {
      expect(text).not.toContain(leaked);
    }
  });

  it("appears only where the API said the project operates this instance", async () => {
    await renderPage(false);
    expect(
      screen.queryByRole("heading", { name: /Who Runs This Copy/ }),
    ).toBeNull();

    cleanup();
    await renderPage(true);
    expect(
      screen.getByRole("heading", { name: /Who Runs This Copy/ }),
    ).toBeInTheDocument();
  });

  it("names the operator, an address that reaches them, and their jurisdiction", async () => {
    await renderPage(true);

    expect(screen.getByText(PROJECT_OPERATOR.name)).toBeInTheDocument();
    expect(
      document.querySelectorAll(
        `a[href="mailto:${PROJECT_OPERATOR.contactEmail}"]`,
      ).length,
    ).toBeGreaterThan(0);
  });

  // §12 is one sentence pointing at a jurisdiction it cannot name. This is the answer,
  // and it has to be the same string the identity paragraph carries - two spellings of
  // the operator's jurisdiction on one page is the failure the shared constant prevents.
  it("answers §12 with the jurisdiction the operator is named in", async () => {
    await renderPage(true);

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;
    expect(block).toHaveTextContent(
      new RegExp(
        `The governing law — §12[\\s\\S]*${PROJECT_OPERATOR.jurisdiction}`,
      ),
    );
    expect(
      screen.getByText(
        new RegExp(`On this copy that is ${PROJECT_OPERATOR.jurisdiction}`),
      ),
    ).toBeInTheDocument();
  });

  // The beta's own terms: what it costs, who may register, what is promised about it
  // being here tomorrow, and what happens to a diver's data if it ends. The last is the
  // one a reader cannot infer from anything else on the page.
  it("states the beta's terms, including what happens to data if it ends", async () => {
    await renderPage(true);

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(/free of charge/);
    expect(block).toHaveTextContent(/registration needs an invitation/);
    expect(block).toHaveTextContent(/no uptime is promised/);
    expect(block).toHaveTextContent(/at least 90 days from that message/);
  });

  // The AGPLv3 section 13 offer, which §7 says is the operator's to make and which no
  // self-hosted copy may carry. Both routes to the source, and the field that says which
  // build is running - `version` alone does not, since every build on the edge channel
  // reports the same one.
  it("makes the AGPL source offer, and names what identifies the running build", async () => {
    await renderPage(true);

    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(
      /complete source of the version\s+running on this copy is\s+available on request/,
    );
    expect(block).toHaveTextContent(
      /in the project’s public repositories at\s+github\.com\/opendiving/,
    );
    expect(block).toHaveTextContent(/\/api\/v1\/health/);
    expect(block).toHaveTextContent(/commit/);
    // The honest half: outside an image the project published, that field says so.
    expect(block).toHaveTextContent(/unknown/);
  });

  // §7 asserts "The project publishes its own source publicly" in the present tense, and
  // since 2026-09-12 that is simply true. What the clause now has to carry is the reason
  // the block's offer still leads with the request: §13 owes the source of the *running
  // version*, which a public repository does not on its own identify. A future edit that
  // shortens this to "the repositories are public, so follow the link" collapses the two,
  // which is the failure this assertion exists to catch.
  it("names §7's public repositories and keeps the request leading", async () => {
    await renderPage(true);

    expect(
      screen.getByText(
        /public\s+repositories this section speaks of are named there too/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/still leads with the request rather than the link/),
    ).toBeInTheDocument();
  });

  it.each([
    ["§7", /On this copy the offer is made/],
    ["§8", /has not replaced it/],
    ["§12", /named\s+with the operator/],
    ["§13", /None, that is, for the project as the software/],
  ])("points %s at the block", async (_label, pointer) => {
    await renderPage(true);

    expect(screen.getByText(pointer)).toBeInTheDocument();
  });

  // The page's own rule, which the block must not break: sections 7, 9 and 10 speak for
  // the OpenDiving project and everything else for the operator. The block is the
  // operator speaking, so it may answer §7's *offer* - which §7 itself assigns to the
  // operator - and must not reword the project's own sections.
  it("leaves the project's three sections speaking for the project", async () => {
    await renderPage(true);

    expect(
      screen.getByText(/7\. Open Source License \(the OpenDiving project\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /9\. Limitation of Liability \(the OpenDiving project\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/10\. Indemnification \(the OpenDiving project\)/),
    ).toBeInTheDocument();
  });
});

// §5 promises that a feature showing entries to someone else arrives with a grant of
// its own and a privacy section of its own. The check-in link is the first that shows
// entries, so its grant, the privacy section it points at, and the sentences that used
// to call the invitation the one thing shown are pinned together.
describe("the check-in link", () => {
  it("has a grant of its own in §5, and the closing rule names both grants", async () => {
    await renderPage(false);

    expect(
      screen.getByText(
        /Where you make a check-in link, you grant the operator/,
      ),
    ).toHaveTextContent(/section 4\.9/);
    expect(
      screen.getByText(
        /The connect link, check-in link, connection and photo proposal grants\s+above/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The next four paragraphs are the four things/),
    ).toBeInTheDocument();
  });

  it("is on §2's list, and §2 counts four cases of one person shown another", async () => {
    await renderPage(false);

    expect(
      screen.getByText(/share it as a link that works\s+for a day/),
    ).toBeInTheDocument();
    expect(screen.getByText(/in four cases only/)).toHaveTextContent(
      /a check-in link you make/,
    );
  });
});

// A connection is the third thing shown across accounts, and it runs both ways: the
// diver sees the account's username and picture, the account sees the diver under
// Added you. It gets the same pair the check-in link did: a grant of its own here,
// pointing at a privacy section of its own, and a place in the count §2 keeps.
describe("connecting a person to an account", () => {
  it("has a grant of its own in §5, naming what each side sees and what the export carries", async () => {
    await renderPage(false);

    const grant = screen.getByText(
      /Where you connect a person you recorded to an account/,
    );
    expect(grant).toHaveTextContent(/section 4\.10/);
    expect(grant).toHaveTextContent(/current username and picture/);
    expect(grant).toHaveTextContent(
      /show that account your\s+name, username and picture under its Added you/,
    );
    expect(grant).toHaveTextContent(/identifier, which also encodes when the/);
    expect(grant).not.toHaveTextContent(/typing|told nothing/);
  });

  it("is counted in §2, which says what a connection shows", async () => {
    await renderPage(false);

    expect(screen.getByText(/in four cases only/)).toHaveTextContent(
      /a person of\s+yours connected to an account here/,
    );
    expect(screen.getByText(/in four cases only/)).not.toHaveTextContent(
      /not connections between accounts/,
    );
    expect(screen.queryByText(/no dive buddies/)).toBeNull();
    // What §2 keeps saying, which is still true.
    expect(screen.getByText(/in four cases only/)).toHaveTextContent(
      /no public profiles/,
    );
  });

  it("counts a person among what can be somebody else's data", async () => {
    await renderPage(false);

    expect(
      screen.getByText(/Three things this copy expects you to hold/),
    ).toHaveTextContent(/A person is the plainest\s+case/);
  });
});

// A join link admits whoever follows it, so every sentence saying registration needs
// an invitation names it - and only where the API said the copy has one, since a copy
// without them carries no word about them.
describe("join links", () => {
  it.each([[false], [true]])(
    "appear nowhere where the API said there are none, project-operated: %s",
    async (projectOperated) => {
      await renderPage(projectOperated, false);

      expect(document.body.textContent).not.toMatch(/join link/i);
    },
  );

  it("are named beside the invitation wherever registration needs one", async () => {
    await renderPage(true, true);

    expect(
      screen.getByText(/registering also needs an invitation/),
    ).toHaveTextContent(
      /unless you came\s+by a member’s connect link or by one of the join links the operator has\s+published, either of which/,
    );
    const block = screen
      .getByRole("heading", { name: /Who Runs This Copy/ })
      .closest("section")!;
    expect(block).toHaveTextContent(
      /only people who have been invited or who follow one of its join links/,
    );
    expect(block).toHaveTextContent(
      /registration needs an invitation or a join link/,
    );
  });
});

// This page carries the month twice - the header and the closing line - and they are
// two literals for one fact. The privacy page's own copy of it is pinned in that page's
// test rather than here: a test file that rendered both pages to compare two strings
// would be asserting an agreement neither page owes the other, since the two documents
// can legitimately be revised on different days.
describe("the date on this page", () => {
  it.each([[false], [true]])(
    "states one effective month in both places, project-operated: %s",
    async (projectOperated) => {
      await renderPage(projectOperated);

      expect(
        screen.getByText(/Last updated: November 2026/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/effective as of November 2026/),
      ).toBeInTheDocument();
    },
  );
});

// A member's connect link shows the member's name and picture to whoever opens it,
// and an account made through it starts connected to the member, so both people's
// grants are in §5 - and the registration sentence names the link whether or not
// the copy has join links.
describe("the connect link", () => {
  it.each([[false], [true]])(
    "is named where registration needs an invitation, join links: %s",
    async (joinLinks) => {
      await renderPage(false, joinLinks);

      expect(
        screen.getByText(/registering also needs an invitation/),
      ).toHaveTextContent(/unless you came\s+by a member’s connect link/);
    },
  );

  it("carries the owner's grant and the joiner's in §5", async () => {
    await renderPage(false);

    const grant = screen.getByText(/Where you make a connect link, you grant/);
    expect(grant).toHaveTextContent(
      /show your\s+name and picture to whoever opens it, and your username to\s+whoever opens it signed in/,
    );
    expect(grant).toHaveTextContent(
      /nobody learns anything of you through it but\s+whoever holds the link, however it reached them/,
    );
    expect(grant).toHaveTextContent(
      /create your account through a member’s connect link, you\s+grant the operator/,
    );
    // Still one paragraph for each thing shown across accounts.
    expect(
      screen.getByText(/The next four paragraphs are the four things/),
    ).toBeInTheDocument();
  });
});

// A photo proposal shows its proposer's name, note and file title to whoever runs
// the copy, on every copy, so it carries its own grant and a place in both counts.
describe.each([[false], [true]])("a photo proposal, Commons %s", (commons) => {
  it("has a grant of its own in §5, pointing at privacy §4.12", async () => {
    await renderPage(false, false, commons);

    const grant = screen.getByText(
      /Where a tool of yours proposes a Wikimedia Commons file/,
    );
    expect(grant).toHaveTextContent(
      /further\s+permission that act needs, and only that/,
    );
    expect(grant).toHaveTextContent(
      /the note sent with it and the name on your\s+account/,
    );
    expect(grant).toHaveTextContent(
      /send the file’s title to Wikimedia Commons/,
    );
    expect(grant).toHaveTextContent(/refuse that file for that species/);
    expect(grant).toHaveTextContent(/section 4\.12/);
  });

  it("is counted in §2 and §5", async () => {
    await renderPage(false, false, commons);

    expect(screen.getByText(/cases only/)).toHaveTextContent(
      /a photo a tool of yours proposes for\s+a species/,
    );
    expect(screen.getByText(/The next \w+ paragraphs/)).toHaveTextContent(
      /a photo proposal,\s+which is an entry shown to whoever reviews it alone/,
    );
    expect(screen.getByText(/grants above are that rule/)).toHaveTextContent(
      /photo proposal/,
    );
  });
});

describe("§5", () => {
  it("counts the dive drafts among what the diver enters", async () => {
    await renderPage(false);

    expect(screen.getByText(/What you enter into this copy/)).toHaveTextContent(
      /dives, dive drafts, sites/,
    );
  });
});

// Each sentence proposing makes false, from both sides: as it stands on every other
// copy, and gone where the Commons is edited.
describe("proposing for OpenDiving Commons", () => {
  const FALSE_ON_THE_PRIMARY = [
    "a private dive log",
    "no comments",
    "apart from an administrator's, which reads a photo a tool of yours proposes for a species.",
    "This copy shows one person to another in four cases only",
    "is stored as given",
    "Nobody checks it, and nothing here corrects it",
    "is yours, and you are responsible for it",
    "You keep every right you have in what you enter",
    "it holds what the next paragraph grants the operator and nothing beyond that",
    "only the permission technically needed",
    "Your entries are not published, shared with other users",
    "The next four paragraphs are the four things this copy does show one person to another",
    "The connect link, check-in link, connection and photo proposal grants above are that rule being kept",
    "exporting what you have entered, your photo proposals aside",
  ];

  const ONLY_ON_THE_PRIMARY = [
    "Proposing for OpenDiving Commons",
    "OpenDiving Commons",
    "CC0",
    "six cases only",
    "The next six paragraphs",
    "A Commons Site’s History",
    "a report about a Commons record",
  ];

  const pageText = () => document.body.textContent?.replace(/\s+/g, " ") ?? "";

  it.each([
    [false, false],
    [true, true],
  ])(
    "leaves every other copy's page as it was (project %s, join links %s)",
    async (projectOperated, joinLinks) => {
      await renderPage(projectOperated, joinLinks);

      const text = pageText();
      for (const sentence of FALSE_ON_THE_PRIMARY) {
        expect(text).toContain(sentence);
      }
      for (const leaked of ONLY_ON_THE_PRIMARY) {
        expect(text).not.toContain(leaked);
      }
    },
  );

  it.each([
    [false, false],
    [true, true],
  ])(
    "corrects each of those where the Commons is edited (project %s, join links %s)",
    async (projectOperated, joinLinks) => {
      await renderPage(projectOperated, joinLinks, true);

      const text = pageText();
      for (const sentence of FALSE_ON_THE_PRIMARY) {
        expect(text).not.toContain(sentence);
      }
    },
  );

  it("has a grant of its own in §5, naming the privacy section by its heading", async () => {
    await renderPage(false, false, true);

    const grant = screen.getByText(/Where you propose a dive site of yours/);
    expect(grant).toHaveTextContent(/further permission that act needs/);
    expect(grant).toHaveTextContent(/never says who proposed it/);
    expect(grant).toHaveTextContent(/stays if you delete your account/);
    expect(grant).toHaveTextContent(/a decline always comes with a reason/);
    expect(grant).toHaveTextContent(/answered by changing the record/);
    expect(grant).toHaveTextContent(/Proposing for OpenDiving Commons/);
    expect(
      grant.querySelector(
        'a[href="https://creativecommons.org/publicdomain/zero/1.0/"]',
      ),
    ).toBeInTheDocument();
  });

  it("counts the proposal and the history in §2 and §5, and the closing rule names both", async () => {
    await renderPage(false, false, true);

    expect(screen.getByText(/in six cases only/)).toHaveTextContent(
      /a proposal for OpenDiving Commons.*and your name beside what a proposal of yours changed in a Commons site's history/,
    );
    expect(screen.getByText(/The next six paragraphs/)).toHaveTextContent(
      /a proposal for OpenDiving Commons.*and your name in a Commons site's history/,
    );
    expect(pageText()).toContain(
      "The connect link, check-in link, connection, photo proposal, Commons proposal and Commons history grants above are that rule being kept",
    );
  });

  it("gives the history a grant of its own in §5, naming the privacy section by its heading", async () => {
    await renderPage(false, false, true);

    const grant = screen.getByText(/Where you choose, for a proposal of yours/);
    expect(grant).toHaveTextContent(/further permission that act needs/);
    expect(grant).toHaveTextContent(/as it is and as you change it/);
    expect(grant).toHaveTextContent(/never your address/);
    expect(grant).toHaveTextContent(
      /turn it off and on again in Your proposals/,
    );
    expect(grant).toHaveTextContent(
      /sees your name beside your entries either way/,
    );
    expect(grant).toHaveTextContent(/administrators alone are shown/);
    expect(grant).toHaveTextContent(
      /listed apart, as the reviewer’s own change/,
    );
    expect(grant).toHaveTextContent(/never reaches the public copies/);
    expect(grant).toHaveTextContent(/the entry stays and names nobody/);
    expect(grant).toHaveTextContent(/A Commons Site’s History/);
  });
});
