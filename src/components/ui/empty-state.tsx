import * as React from "react";

export interface EmptyStateProps {
  /**
   * The same icon the thing carries everywhere else - the dive mark for dives,
   * `Luggage` for trips - so an empty card still says what it is for.
   */
  icon: React.ComponentType<{ className?: string }>;
  /** "No dives logged yet", not "Nothing here". */
  title: string;
  description?: React.ReactNode;
  /** The one button that fills this emptiness. */
  action?: React.ReactNode;
}

/**
 * The centred "nothing here yet" block every list and card shows when it has no
 * rows: icon, heading, a line of explanation, one action.
 *
 * Spacing runs downwards (`mt-*`, never `mb-*`) so a block with no description,
 * or no action, closes up instead of leaving the gap its missing neighbour would
 * have filled.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <Icon className="h-12 w-12 text-muted-foreground mx-auto" />
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
