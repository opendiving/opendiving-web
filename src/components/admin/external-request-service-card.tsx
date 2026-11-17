import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NOT_SENT_OUTCOMES,
  type ServiceSummary,
  type Tally,
  describeLimit,
  formatCount,
  formatDuration,
  hadEvents,
  outcomeLabel,
} from "@/components/admin/external-requests";

interface ServiceCardProps {
  summary: ServiceSummary;
  label: string;
}

/**
 * One service's month: every outcome, and the duration of what was sent, for
 * the service as a whole and for each kind of request, one column each. Rows
 * rather than columns per outcome, so a service with one kind is two columns
 * wide and only a service with many kinds scrolls inside the table.
 */
export function ExternalRequestServiceCard({
  summary,
  label,
}: ServiceCardProps) {
  const columns: { key: string; heading: string; tally: Tally }[] = [
    { key: "", heading: "All", tally: summary.all },
    ...summary.kinds.map(({ kind, tally }) => ({
      key: kind,
      heading: kind,
      tally,
    })),
  ];

  const row = (heading: string, cell: (tally: Tally) => string) => (
    <TableRow key={heading}>
      <TableHead scope="row" className="h-auto py-2">
        {heading}
      </TableHead>
      {columns.map((column) => (
        <TableCell key={column.key} className="py-2 text-right tabular-nums">
          {cell(column.tally)}
        </TableCell>
      ))}
    </TableRow>
  );
  const group = (heading: string) => (
    <TableRow key={heading} className="hover:bg-transparent">
      <TableHead
        scope="rowgroup"
        colSpan={columns.length + 1}
        className="h-auto pt-4 pb-1 text-foreground"
      >
        {heading}
      </TableHead>
    </TableRow>
  );
  const count = (outcome: string) => (tally: Tally) =>
    formatCount(tally.outcomes[outcome] ?? 0);
  const duration = (ms: number | null) =>
    ms === null ? "-" : formatDuration(ms);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{summary.provider}</CardTitle>
        <CardDescription>
          {summary.limit
            ? `Own limit: ${describeLimit(summary.limit)}, at most ${formatCount(summary.limit.per_day)} a day.`
            : "No limit of its own."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hadEvents(summary) ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <span className="sr-only">Outcome</span>
                </TableHead>
                {columns.map((column) => (
                  <TableHead key={column.key} className="text-right">
                    {column.heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {group("Sent to the service")}
              {row("Requests", (tally) => formatCount(tally.sent))}
              {summary.sentOutcomes.map((outcome) =>
                row(outcomeLabel(outcome), count(outcome)),
              )}
              {row("Average time", (tally) => duration(tally.averageMs))}
              {row("Slowest", (tally) => duration(tally.slowestMs))}
              {group("Not sent")}
              {NOT_SENT_OUTCOMES.map((outcome) =>
                row(outcomeLabel(outcome), count(outcome)),
              )}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No requests in {label}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
