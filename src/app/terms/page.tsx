import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply to this copy of OpenDiving: which parts speak for the operator who runs it, and which speak for the OpenDiving project.",
};

// Two speakers on one page, and the heading is what tells them apart. Sections 7,
// 9 and 10 speak for the OpenDiving project and name it in their headings;
// everything else speaks for the operator of this copy. Bare "OpenDiving" is the
// name of the software and never a party doing anything — collapsing the two back
// into one voice would hand the project's AGPL liability shield to an operator who
// never agreed to it. See "The terms page has two speakers" in DECISIONS.md.
export default function TermsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-card rounded-lg shadow-sm p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Terms of Service
          </h1>
          <p className="text-muted-foreground">Last updated: August 2026</p>
        </div>

        <div className="prose max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is open-source software for logging dives. Anyone can
              download it and run their own copy, and these Terms ship with the
              software, so they describe <strong>this</strong> copy &mdash; the
              one you are reading them on. By using it (&ldquo;the
              Service&rdquo;) you agree to them. If you do not, please do not
              use this copy.
            </p>
            <p className="text-foreground mb-4">
              Two different parties appear on this page, and it keeps them apart
              because they are not the same and do not owe you the same things:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>The OpenDiving project</strong> &mdash; the people who
                write the software. The project operates nothing: it runs no
                servers for this copy, receives no data from it, and never sees
                what you log here.
              </li>
              <li>
                <strong>The operator of this copy</strong> &mdash; whoever
                installed OpenDiving on the machine serving you this page and
                runs it. They decide who may sign up, where the data sits, what
                it costs if anything, and whether the Service is still here
                tomorrow.
              </li>
            </ul>
            <p className="text-foreground mb-4">
              Every section below speaks for the operator of this copy unless
              its heading says otherwise, and &ldquo;we&rdquo; in those sections
              means the operator. Three sections say otherwise: 7, 9 and 10
              speak for the OpenDiving project and name it in their headings.
              Section 5 is the operator&rsquo;s apart from what it says about
              the OpenDiving project, which names the project where it does.
              Where the word <em>OpenDiving</em> stands alone anywhere on this
              page, it is the name of the software and not a party doing
              anything.
            </p>
            <p className="text-foreground mb-4">
              If you are the one running this copy, that phrase &mdash;{" "}
              <em>the operator of this copy</em> &mdash; is you, and it is
              written out wherever a sentence here turns on something only you
              can answer for. Searching the page for it is the quickest way to
              find what is yours to stand behind or to replace with your own;
              the rule above is what settles anything it misses.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. Description of Service
            </h2>
            <p className="text-foreground mb-4">
              This copy of OpenDiving is a private dive log. The software lets
              you:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Log dives, by hand or from a file exported by a dive computer
              </li>
              <li>
                Keep your own list of dive sites and plan trips around them
              </li>
              <li>Track your gear and when it is due for service</li>
              <li>Record your diving certifications</li>
              <li>
                Note the species you saw, from public registers of marine life
              </li>
            </ul>
            <p className="text-foreground mb-4">
              What it does not do is worth stating, because a page like this one
              usually claims otherwise: there are no public profiles, no feeds,
              no forums, no comments, no ratings, no dive buddies and no photo
              sharing. Nothing you enter is visible to any other account on this
              copy. Section 5 says what follows from that.
            </p>
            <p className="text-foreground mb-4">
              Whether this copy costs anything, who may register for it, and how
              long it keeps running are decisions for the operator of this copy,
              not for the software. The software is free in the sense section
              7&rsquo;s licence means, which says nothing about what an operator
              charges.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. User Accounts and Registration
            </h2>
            <p className="text-foreground mb-4">
              Using this copy for anything beyond the pages you can read now
              needs an account. You agree to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Register with an email address you actually control &mdash; it
                is how you sign in and how the operator of this copy reaches you
              </li>
              <li>
                Keep that mailbox secure. There is no password here: you sign in
                with a link or a code sent to your email, with a passkey, or
                &mdash; where this copy offers it &mdash; with Google. So
                whoever can read that mailbox, use that passkey, or get into
                that Google account can sign in as you
              </li>
              <li>
                Tell the operator of this copy promptly if you think someone
                else has got into your account
              </li>
              <li>Accept responsibility for what is done under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              4. Safety and Diving Responsibilities
            </h2>
            <div className="rounded-md border border-warning/40 bg-warning/10 p-4 mb-4">
              <p className="font-medium text-warning">
                <strong>Important Safety Notice:</strong> OpenDiving is software
                for logging dives. It does not provide diving instruction,
                safety advice, or emergency services.
              </p>
            </div>
            <p className="text-foreground mb-4">
              You acknowledge and agree that:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Diving is an inherently risky activity</li>
              <li>
                You are solely responsible for your diving safety and decisions
              </li>
              <li>
                You will only dive within your certification and experience
                level
              </li>
              <li>
                You will follow proper diving safety protocols and procedures
              </li>
              <li>
                Nothing this software works out or displays &mdash; depths,
                times, gas figures, exposure &mdash; is a substitute for your
                training, your dive computer and your own judgement
              </li>
              <li>
                What you type in, and what is imported from a dive computer, is
                stored as given. Nobody checks it, and nothing here corrects it
              </li>
              <li>
                Neither the OpenDiving project nor the operator of this copy is
                liable for diving-related injuries or incidents: section 9 is
                the project&rsquo;s position, section 8 the operator&rsquo;s
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              5. User Content and Conduct
            </h2>
            <p className="text-foreground mb-4">
              What you enter into this copy &mdash; dives, sites, trips, gear,
              certifications, notes, and the files you import &mdash; is yours,
              and you are responsible for it. You agree not to use this copy to
              hold or send:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Anything unlawful where you are, or where the operator of this
                copy is
              </li>
              <li>
                Anything you have no right to hold, including other
                people&rsquo;s personal data you have no basis for keeping and
                material that infringes someone else&rsquo;s rights
              </li>
              <li>
                Anything aimed at breaking into, overloading or disrupting this
                copy, or at working around the limits it puts on requests
              </li>
            </ul>
            <p className="text-foreground mb-4">
              You keep every right you have in what you enter. Nothing here
              gives the OpenDiving project any rights in your content: the
              project runs no servers, receives no data from this copy, and
              never sees what you log.
            </p>
            <p className="text-foreground mb-4">
              You grant the operator of this copy only the permission
              technically needed to run the Service for you &mdash; to store
              your entries, show them back to you, and include them in exports
              you ask for. Your entries are not published, shared with other
              users, or shown to anyone else by this software.
            </p>
            <p className="text-foreground mb-4">
              That permission is deliberately no wider than what running the
              Service takes, and the OpenDiving project holds itself to keeping
              it that way: if a version of the software ever adds a way to show
              what you entered to someone else, that feature arrives with a
              permission of its own written here and a section of its own on the
              privacy page, rather than leaning on this one.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              6. Privacy and Data Protection
            </h2>
            <p className="text-foreground mb-4">
              What this copy collects, what it keeps in your browser, how long
              it keeps any of it, and who is answerable for it are set out in
              the{" "}
              <Link
                href="/privacy"
                className="underline hover:text-muted-foreground"
              >
                Privacy Policy
              </Link>
              , which describes this copy the same way these Terms do.
            </p>
            <p className="text-foreground mb-4">
              Two things worth knowing without reading it: exporting everything
              you have entered and deleting your account are both buttons in
              Settings, and neither needs anyone&rsquo;s permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              7. Open Source License (the OpenDiving project)
            </h2>
            <p className="text-foreground mb-4">
              This section is about the software rather than about this
              copy&rsquo;s operation, and it speaks for the OpenDiving project.
              OpenDiving is published under the GNU Affero General Public
              License, version 3. Under it anyone may run, study, copy, modify
              and redistribute the software, on the conditions the licence sets
              out &mdash; chiefly that a derived version carries the same
              licence and stays source-available.
            </p>
            <p className="text-foreground mb-4">
              The licence also gives you something as someone merely using a
              copy over a network: if the operator of this copy has modified
              OpenDiving, section 13 of the AGPLv3 requires them to offer you
              the source of their modified version. That offer is theirs to make
              and not the project&rsquo;s. The project publishes its own source
              publicly, and that is not necessarily what is running here.
            </p>
            <p className="text-foreground mb-4">
              The licence text ships with the software and is the authority on
              all of this. Nothing in these Terms adds to it or takes anything
              away from it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              8. Service Availability and Modifications
            </h2>
            <p className="text-foreground mb-4">
              Whether this copy is available, and for how long, is the operator
              of this copy&rsquo;s to decide. They may modify or discontinue
              features, take it down for maintenance, or stop running it
              altogether. Nothing in the software guarantees uptime, and the
              OpenDiving project cannot promise any: it does not run this copy
              and could not keep it up if it wanted to.
            </p>
            <p className="text-foreground mb-4">
              These Terms are part of the software, so they change when the
              software changes and ship in the same release. There is no
              mechanism here that emails anyone about a change to them, and this
              page is not going to promise one it does not have. What exists
              instead is the software&rsquo;s public history, where every
              earlier version of this page can be read; which version you are
              reading depends on which release of OpenDiving this copy is
              running.
            </p>
            <p className="text-foreground mb-4">
              This copy of OpenDiving is provided as-is by its operator, who is
              responsible for its operation and for the data it holds. The
              operator may replace this paragraph with its own terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              9. Limitation of Liability (the OpenDiving project)
            </h2>
            <p className="text-foreground mb-4">
              This section speaks for the OpenDiving project, not for the
              operator of this copy. To the maximum extent permitted by law, the
              OpenDiving project, its contributors, and its copyright holders
              shall not be liable to you for:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Any indirect, incidental, special, or consequential damages
              </li>
              <li>Loss of data, profits, or business interruption</li>
              <li>Diving accidents or injuries of any kind</li>
              <li>
                Anything you decided on the strength of what the Service showed
                you
              </li>
              <li>
                Content entered into any copy of OpenDiving, and interactions
                between the users of a copy where an operator has enabled any
              </li>
            </ul>
            <p className="text-foreground mb-4">
              This limitation is agreed for the benefit of the OpenDiving
              project and its contributors, who are not parties to these Terms
              but may rely on this section. It adds to, and does not narrow,
              sections 15 to 17 of the AGPLv3.
            </p>
            <p className="text-foreground mb-4">
              The operator of this copy is a different party and says nothing
              here. Their position is the last paragraph of section 8, and it is
              theirs to replace.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              10. Indemnification (the OpenDiving project)
            </h2>
            <p className="text-foreground mb-4">
              You agree to indemnify and hold harmless the OpenDiving project
              and its contributors &mdash; not the operator of this copy &mdash;
              from any claims, damages, or expenses arising from your use of
              this copy of OpenDiving or your violation of these Terms.
            </p>
            <p className="text-foreground mb-4">
              This section does not cover the operator of this copy. They are
              not indemnified by it, and an operator who wants an indemnity has
              to ask for one in terms of their own.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              11. Termination
            </h2>
            <p className="text-foreground mb-4">
              The operator of this copy may suspend or close your account for a
              breach of these Terms, and may stop running this copy altogether.
              You can delete your own account at any time in Settings; the
              Privacy Policy says what happens to your data when you do.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              12. Governing Law
            </h2>
            <p className="text-foreground mb-4">
              These Terms shall be governed by and construed in accordance with
              the laws of the jurisdiction where the operator of this copy
              primarily operates the Service, without regard to conflict of law
              provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              13. Contact Information
            </h2>
            <p className="text-foreground mb-4">
              For anything to do with this copy &mdash; your account, your data,
              what these Terms mean for you, or the Service being down &mdash;
              the person to ask is whoever runs this copy of OpenDiving. The{" "}
              <Link
                href="/contact"
                className="underline hover:text-muted-foreground"
              >
                contact page
              </Link>{" "}
              is how this copy offers to reach them.
            </p>
            <p className="text-foreground mb-4">
              For a defect in the software itself &mdash; a bug, or a sentence
              on a page like this one that the software does not live up to
              &mdash; the OpenDiving project is who to tell, in its public
              source repository. The project cannot answer for how this copy is
              run: it has no access to it and holds none of your data.
            </p>
            <p className="text-foreground mb-4">
              There is deliberately no project address printed here. A question
              about your own account sent to the project reaches people who
              cannot act on it. How quickly the operator of this copy answers,
              and whether they do, is theirs to say rather than this
              page&rsquo;s.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              These Terms are effective as of August 2026 and apply to this copy
              of OpenDiving.
            </p>
            <Link
              href="/"
              className="mt-4 sm:mt-0 text-sm font-medium text-foreground underline hover:text-muted-foreground"
            >
              Back to OpenDiving
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
