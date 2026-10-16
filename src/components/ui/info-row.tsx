import type { ReactNode } from "react";

// One labelled fact in a record's info card, rendered only where the record
// holds it - the shape the dive sidebar's blocks use.
export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
