"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { formatDateTime } from "@/lib/date-time";
import type { AdminInviteRequest } from "@/lib/api/admin";

interface InviteRequestsTableProps {
  requests: AdminInviteRequest[];
  isLoading: boolean;
  /** Rows to draw as skeletons on the first load, so the page does not jump. */
  itemsPerPage: number;
  /** The addresses currently selected, which is what the page's actions act on. */
  selected: string[];
  onToggle: (email: string, checked: boolean) => void;
  /**
   * Clear the selection if anything is selected, otherwise start one. It takes
   * no argument on purpose - the header box cannot report its own state
   * usefully once the page caps the selection; see `toggleAll` there.
   */
  onToggleAll: () => void;
}

/**
 * The queue itself: one row per address that has asked for an invitation, each
 * selectable.
 *
 * Keyed and selected by address throughout, because that is all a request has -
 * the rows carry no identifier of their own.
 *
 * **Checkboxes, not switches, and this is the one table in the app that says so.**
 * A row here is picked for a batch that is about to be submitted, not a setting
 * left flipped, and multi-select is canonically a checkbox. The select-all needs
 * the third state on top of that: `indeterminate` for a partial selection, which
 * `role="switch"` cannot express - ARIA gives it two states and forbids
 * `aria-checked="mixed"`. A native checkbox exposes the mixed state to assistive
 * tech as well as drawing the dash, so it is a channel of its own; the page's
 * "N addresses selected" `aria-live` region above this table is the complement,
 * announced as the selection changes rather than when the box is reached.
 *
 * `has_account` earns a marker rather than a filter or a hidden row. The public
 * request form cannot tell whether an address already has an account (it must
 * not consult the user table at all), so these arrive in the queue like any
 * other, and inviting one is a no-op the batch reports back as
 * `already_registered`. Showing it lets the operator remove the row instead.
 */
export function InviteRequestsTable({
  requests,
  isLoading,
  itemsPerPage,
  selected,
  onToggle,
  onToggleAll,
}: InviteRequestsTableProps) {
  const allSelected =
    requests.length > 0 &&
    requests.every((request) => selected.includes(request.email));
  const someSelected = requests.some((request) =>
    selected.includes(request.email),
  );

  if (!isLoading && requests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nobody is waiting for an invitation. Addresses entered on the home page
        show up here.
      </div>
    );
  }

  return (
    <Table
      // Busy on the outside, hidden on each placeholder row within - the split
      // `ListRowsSkeleton` documents, applied here because the rows themselves
      // are `aria-hidden` and would otherwise leave a reader with a table that
      // is silently empty rather than one that is loading.
      aria-busy={requests.length === 0 || undefined}
    >
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              // The tri-state has to be set on the DOM node - `indeterminate` is
              // a property, not an attribute, so React will not render it.
              ref={(node) => {
                if (node) node.indeterminate = someSelected && !allSelected;
              }}
              checked={allSelected}
              // The event's `checked` is deliberately dropped: it is unreliable
              // here (see `toggleAll` on the page), and the control's meaning is
              // "clear the selection, or start one" rather than a mirror of a
              // box's state.
              onChange={() => onToggleAll()}
              aria-label="Select a batch of requests, or clear the selection"
            />
          </TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 && (
          <TableRowsSkeleton columns={4} rows={itemsPerPage} />
        )}
        {requests.map((request) => (
          <TableRow key={request.email}>
            <TableCell>
              <Checkbox
                checked={selected.includes(request.email)}
                onChange={(event) =>
                  onToggle(request.email, event.target.checked)
                }
                // Named per row: a screen reader's controls list is flat, and a
                // page of identical "Select"es names nothing.
                aria-label={`Select ${request.email}`}
              />
            </TableCell>
            <TableCell className="font-medium">{request.email}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(request.created_at)}
            </TableCell>
            <TableCell>
              {request.has_account && (
                <Badge variant="warning" className="whitespace-nowrap">
                  Already has an account
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
