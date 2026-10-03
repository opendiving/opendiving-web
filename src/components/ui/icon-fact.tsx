import { Fragment, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// An icon on a backdrop's text line, the text's height, glowing as the text
// does - through a filter, since `text-shadow` stops at an SVG.
export const LINE_ICON =
  "inline-block size-[1em] align-[-0.125em] [filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]";

// A fact marked by an icon, which a screen reader hears as its label.
export function IconFact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="whitespace-nowrap">
      <Icon aria-hidden className={cn("mr-0.5", LINE_ICON)} />
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

// A line of facts, dot-separated: a card's or a hero's line under its name.
export function FactsLine({ facts }: { facts: ReactNode[] }) {
  return facts.map((fact, index) => (
    <Fragment key={index}>
      {index > 0 && " · "}
      {fact}
    </Fragment>
  ));
}
