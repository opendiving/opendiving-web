"use client";

import {
  SHARED_MEMBER_ROWS,
  type SharedMemberRow,
} from "@/components/sites/shared-member-rows";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUnits } from "@/hooks/useUnits";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";
import { cn } from "@/lib/utils";

// What is under review, member by member: a change against the record as it stands,
// with what the proposer named marked, and a new site as proposed.
export function ProposalMembers({
  proposal,
}: {
  proposal: AdminDiveSiteProposal;
}) {
  const { preferences: units } = useUnits();
  const isChange = proposal.kind === "change";

  const cell = (members: DiveSiteSharedMembers, row: SharedMemberRow) =>
    row.show(members, units) || (
      <span className="text-muted-foreground">Not recorded</span>
    );

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Members</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            {isChange && <TableHead>Current</TableHead>}
            <TableHead>Proposed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SHARED_MEMBER_ROWS.map((row) => {
            const changed =
              isChange &&
              row.keys.some((key) => proposal.changed.includes(key));
            return (
              <TableRow key={row.label}>
                <TableCell className="text-muted-foreground">
                  {row.label}
                </TableCell>
                {isChange && (
                  <TableCell>{cell(proposal.current, row)}</TableCell>
                )}
                <TableCell className={cn(changed && "font-semibold")}>
                  {cell(proposal.proposed, row)}
                  {changed && <span className="sr-only"> (changed)</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
