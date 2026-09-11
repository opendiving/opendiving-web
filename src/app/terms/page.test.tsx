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
const { projectOperatesThisInstance } = vi.hoisted(() => ({
  projectOperatesThisInstance: vi.fn(),
}));
vi.mock("@/lib/api/config.server", () => ({ projectOperatesThisInstance }));

// `await TermsPage()`: an async Server Component is a function returning a promise, and
// handing the component to `render` renders the promise instead of the page.
async function renderPage(projectOperated: boolean) {
  projectOperatesThisInstance.mockResolvedValue(projectOperated);
  render(await TermsPage());
}

// Words only the operator block can put on this page. Asserted as absences rather than
// captured in a DOM snapshot, for the reason `privacy/page.test.tsx` gives beside its own
// copy of this list: a snapshot of a page this size is churn nobody reads, and a failure
// here names the string that leaked.
const OPERATOR_ONLY = [
  "Who runs this copy",
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
      screen.queryByRole("heading", { name: /Who runs this copy/ }),
    ).toBeNull();

    cleanup();
    await renderPage(true);
    expect(
      screen.getByRole("heading", { name: /Who runs this copy/ }),
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
      .getByRole("heading", { name: /Who runs this copy/ })
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
      .getByRole("heading", { name: /Who runs this copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(/free of charge/);
    expect(block).toHaveTextContent(/registration needs an invitation/);
    expect(block).toHaveTextContent(/no uptime is promised/);
    expect(block).toHaveTextContent(/at least 30 days from that message/);
  });

  // The AGPLv3 section 13 offer, which §7 says is the operator's to make and which no
  // self-hosted copy may carry. Both routes to the source, and the field that says which
  // build is running - `version` alone does not, since every build on the edge channel
  // reports the same one.
  it("makes the AGPL source offer, and names what identifies the running build", async () => {
    await renderPage(true);

    const block = screen
      .getByRole("heading", { name: /Who runs this copy/ })
      .closest("section")!;

    expect(block).toHaveTextContent(
      /complete source of the version\s+running on this copy is\s+available on request/,
    );
    expect(block).toHaveTextContent(/github\.com\/opendiving/);
    expect(block).toHaveTextContent(/\/api\/v1\/health/);
    expect(block).toHaveTextContent(/commit/);
    // The honest half: outside an image the project published, that field says so.
    expect(block).toHaveTextContent(/unknown/);
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

describe("the date on both legal pages", () => {
  it.each([[false], [true]])(
    "carries one effective month, project-operated: %s",
    async (projectOperated) => {
      await renderPage(projectOperated);

      expect(
        screen.getByText(/Last updated: September 2026/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/effective as of September 2026/),
      ).toBeInTheDocument();
    },
  );
});
