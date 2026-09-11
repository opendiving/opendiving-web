import type { ReactNode } from "react";

import { PROJECT_OPERATOR } from "@/lib/operator";

// The block `/privacy` and `/terms` grow where the OpenDiving project is this copy's
// operator, and the only thing either page renders that names a party.
//
// Unnumbered, and above section 1 on both pages. Numbered, it would either renumber
// everything under it - and the privacy page's numbering is load-bearing, cited from its
// own prose and from the terms page - or take a number at the end, which is the wrong
// place for the one paragraph telling a reader who is answerable for their data. So it
// sits outside the numbering and points *into* it: each answer names the sections whose
// prose leaves that question to the operator, and those sections keep their numbers.
//
// Each page passes its own answers. The identity is the half that is the same on both,
// and it is here so that it cannot come to differ between them.
export function OperatorBlock({
  intro,
  children,
}: {
  /** One sentence saying what this page's answers are answers to. */
  intro: ReactNode;
  /** The page's `OperatorAnswer` entries. */
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="who-runs-this-copy"
      className="mb-8 rounded-md border border-border bg-muted/40 p-6"
    >
      <h2
        id="who-runs-this-copy"
        className="text-2xl font-semibold text-foreground mb-4"
      >
        Who runs this copy
      </h2>
      <p className="text-foreground mb-4">
        This copy of OpenDiving is operated by{" "}
        <strong>{PROJECT_OPERATOR.name}</strong>, in{" "}
        {PROJECT_OPERATOR.jurisdiction}, who can be reached at{" "}
        <a
          href={`mailto:${PROJECT_OPERATOR.contactEmail}`}
          className="underline hover:text-muted-foreground"
        >
          {PROJECT_OPERATOR.contactEmail}
        </a>
        . Anything these pages send to &ldquo;whoever runs this copy&rdquo;
        comes there. It is the operator&rsquo;s address and not the software
        author&rsquo;s, which is the distinction both pages draw and keep: the
        OpenDiving project wrote this software and also runs this particular
        copy, and it is answerable here in the second role.
      </p>
      <p className="text-foreground mb-4">{intro}</p>
      <dl className="space-y-4">{children}</dl>
    </section>
  );
}

// One answer, labelled with the sections that ask for it. `question` carries the
// section references rather than the answer carrying them, so a reader arriving from
// §5 can find their paragraph by scanning the left-hand column.
export function OperatorAnswer({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="font-semibold text-foreground">{question}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
