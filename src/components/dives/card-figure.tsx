import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The figures of a card on the dive page, set as a dive card's are and each about
// as wide as "211.44 bar", so they line up from card to card and wrap onto a
// second line on a phone too narrow for three, as the dive hero's figures do.
export function CardFigures({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl className={cn("flex flex-wrap gap-x-3 gap-y-2", className)}>
      {children}
    </dl>
  );
}

// A figure a record may not carry, muted where it carries none: an absence at
// full contrast reads as a value.
export function CardFigure({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="min-w-20">
      <dt className="text-xs">{label}</dt>
      <dd
        className={cn(
          "whitespace-nowrap text-base font-bold",
          value == null && "text-muted-foreground",
        )}
      >
        {value ?? "-"}
      </dd>
    </div>
  );
}
