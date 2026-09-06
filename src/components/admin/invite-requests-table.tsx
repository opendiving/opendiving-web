"use client";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  onToggleAll: (checked: boolean) => void;
}

/**
 * The queue itself: one row per address that has asked for an invitation, each
 * selectable.
 *
 * Keyed and selected by address throughout, because that is all a request has -
 * the rows carry no identifier of their own.
 *
 * **The select-all is a switch, so it has no partial state to draw.** A checkbox
 * had one - `indeterminate`, set on the DOM node - and a switch cannot: ARIA
 * gives `role="switch"` two states and forbids `aria-checked="mixed"`. Nothing is
 * lost, because that dash was always the second channel for it: the page prints
 * "N addresses selected" in an `aria-live` region directly above this table, which
 * is both more precise than "some" and the only one of the two a screen reader
 * announced as it changed.
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

  if (!isLoading && requests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nobody is waiting for an invitation. Addresses entered on the home page
        show up here.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">
            <Switch
              checked={allSelected}
              onCheckedChange={onToggleAll}
              aria-label="Select every request on this page"
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
              <Switch
                checked={selected.includes(request.email)}
                onCheckedChange={(next) => onToggle(request.email, next)}
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
