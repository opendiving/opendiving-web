"use client";

import type { ReactNode } from "react";

import { ExternalIdLink } from "@/components/sites/external-id-link";
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
import { ENTRY_TYPE_LABELS, WATER_TYPE_LABELS } from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { formatAltitude, formatDepth, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

interface MemberRow {
  label: string;
  // The wire's names for what the row shows, which is what `changed` holds.
  keys: (keyof DiveSiteSharedMembers)[];
  show: (members: DiveSiteSharedMembers, units: UnitSystem) => ReactNode;
}

const ROWS: MemberRow[] = [
  { label: "Name", keys: ["name"], show: (members) => members.name },
  {
    label: "Other names",
    keys: ["other_names"],
    show: (members) => members.other_names.join(", "),
  },
  {
    label: "Pin",
    keys: ["latitude", "longitude"],
    show: ({ latitude, longitude }) =>
      latitude !== null && `${latitude}, ${longitude}`,
  },
  {
    label: "Location",
    keys: ["location_name"],
    show: (members) => members.location_name,
  },
  {
    label: "Depth from",
    keys: ["depth_from"],
    show: ({ depth_from }, units) =>
      depth_from !== null && formatDepth(depth_from, units),
  },
  {
    label: "Depth to",
    keys: ["depth_to"],
    show: ({ depth_to }, units) =>
      depth_to !== null && formatDepth(depth_to, units),
  },
  {
    label: "Water type",
    keys: ["water_type"],
    show: ({ water_type }) =>
      water_type && labelOrFallback(WATER_TYPE_LABELS, water_type),
  },
  {
    label: "Altitude",
    keys: ["altitude"],
    show: ({ altitude }, units) =>
      altitude !== null && formatAltitude(altitude, units),
  },
  {
    label: "Entry types",
    keys: ["entry_types"],
    show: ({ entry_types }) =>
      entry_types
        .map((entry) => labelOrFallback(ENTRY_TYPE_LABELS, entry))
        .join(", "),
  },
  {
    label: "Registries",
    keys: ["external_ids"],
    show: ({ external_ids }) =>
      external_ids.length > 0 && (
        <ul>
          {external_ids.map((entry) => (
            <li key={`${entry.registry}:${entry.identifier}`}>
              <ExternalIdLink entry={entry} />
            </li>
          ))}
        </ul>
      ),
  },
];

// What is under review, member by member: a change against the record as it stands,
// with what the proposer named marked, and a new site as proposed.
export function ProposalMembers({
  proposal,
}: {
  proposal: AdminDiveSiteProposal;
}) {
  const units = useUnits();
  const isChange = proposal.kind === "change";

  const cell = (members: DiveSiteSharedMembers, row: MemberRow) =>
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
          {ROWS.map((row) => {
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
