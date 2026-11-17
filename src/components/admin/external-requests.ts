import type {
  AdminExternalRequestLimit,
  AdminExternalRequests,
} from "@/lib/api/admin";
import type { Series } from "@/components/admin/daily-stats";

// Everything the External Requests page computes from `GET /admin/external-requests`,
// kept apart from the markup so the arithmetic is assertable.
//
// Services, kinds and outcomes are words to show. One the API adds later is shown
// under its slug, and an unknown outcome is read as a sent request that did not
// succeed, so an API that grows its vocabulary needs no change here.

const OUTCOME_LABELS: Record<string, string> = {
  ok: "Answered",
  rate_limited: "Too many requests",
  status: "Error response",
  too_large: "Response too large",
  deadline: "Timed out",
  transport: "Connection failed",
  cancelled: "Cancelled",
  skipped: "Own limit reached",
  cache_hit: "From cache",
};

// The outcomes of a request that went out, in the page's order.
export const SENT_OUTCOMES = [
  "ok",
  "rate_limited",
  "status",
  "too_large",
  "deadline",
  "transport",
  "cancelled",
];

// The two events that sent nothing.
export const NOT_SENT_OUTCOMES = ["skipped", "cache_hit"];

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

export function isSent(outcome: string): boolean {
  return !NOT_SENT_OUTCOMES.includes(outcome);
}

/** What one service, or one of its kinds, did over the month. */
export interface Tally {
  // Requests that went out.
  sent: number;
  // Of those, the ones not answered.
  failed: number;
  // Every outcome's count, the two that sent nothing included.
  outcomes: Record<string, number>;
  // Over the sent requests, in whole milliseconds; null when none was sent.
  averageMs: number | null;
  slowestMs: number | null;
}

/** One service over the month, as the page shows it. */
export interface ServiceSummary {
  provider: string;
  limit: AdminExternalRequestLimit | null;
  all: Tally;
  // Every kind the API declares for it, then any other it was counted under.
  kinds: { kind: string; tally: Tally }[];
  // The known sent outcomes, then any unknown one the month holds for it.
  sentOutcomes: string[];
  // One figure per day of the response, in its order.
  sentPerDay: number[];
  failedPerDay: number[];
  // The day with the most sent requests, or null when none was sent.
  busiest: { day: string; sent: number } | null;
}

interface Accumulator {
  outcomes: Record<string, number>;
  durationTotal: number;
  slowest: number;
}

function tally({ outcomes, durationTotal, slowest }: Accumulator): Tally {
  const sent = Object.entries(outcomes)
    .filter(([outcome]) => isSent(outcome))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    sent,
    failed: sent - (outcomes.ok ?? 0),
    outcomes,
    averageMs: sent > 0 ? Math.round(durationTotal / sent) : null,
    slowestMs: sent > 0 ? slowest : null,
  };
}

function add(
  into: Accumulator,
  outcome: string,
  count: number,
  durationTotal: number,
  durationMax: number,
) {
  into.outcomes[outcome] = (into.outcomes[outcome] ?? 0) + count;
  if (isSent(outcome)) {
    into.durationTotal += durationTotal;
    into.slowest = Math.max(into.slowest, durationMax);
  }
}

const empty = (): Accumulator => ({
  outcomes: {},
  durationTotal: 0,
  slowest: 0,
});

/**
 * One summary per service: every service the API lists, in its order, then any
 * other the month holds counts for, by slug.
 */
export function summariseServices(
  answer: AdminExternalRequests,
): ServiceSummary[] {
  const declared = new Map(
    answer.providers.map((provider) => [provider.provider, provider]),
  );
  const counted = answer.days.flatMap((day) => day.requests);
  const undeclared = [
    ...new Set(
      counted
        .map((row) => row.provider)
        .filter((provider) => !declared.has(provider)),
    ),
  ].sort();

  return [...declared.keys(), ...undeclared].map((provider) => {
    const rows = counted.filter((row) => row.provider === provider);
    const declaredKinds = declared.get(provider)?.kinds ?? [];
    const kinds = [
      ...declaredKinds,
      ...[...new Set(rows.map((row) => row.kind))]
        .filter((kind) => !declaredKinds.includes(kind))
        .sort(),
    ];

    const all = empty();
    const byKind = new Map(kinds.map((kind) => [kind, empty()]));
    for (const row of rows) {
      for (const into of [all, byKind.get(row.kind)!]) {
        add(
          into,
          row.outcome,
          row.count,
          row.duration_ms_total,
          row.duration_ms_max,
        );
      }
    }

    const perDay = (failedOnly: boolean) =>
      answer.days.map((day) =>
        day.requests
          .filter(
            (row) =>
              row.provider === provider &&
              isSent(row.outcome) &&
              !(failedOnly && row.outcome === "ok"),
          )
          .reduce((sum, row) => sum + row.count, 0),
      );
    const sentPerDay = perDay(false);
    const most = Math.max(0, ...sentPerDay);

    return {
      provider,
      limit: declared.get(provider)?.limit ?? null,
      all: tally(all),
      kinds: kinds.map((kind) => ({ kind, tally: tally(byKind.get(kind)!) })),
      sentOutcomes: [
        ...SENT_OUTCOMES,
        ...Object.keys(all.outcomes)
          .filter(
            (outcome) => isSent(outcome) && !SENT_OUTCOMES.includes(outcome),
          )
          .sort(),
      ],
      sentPerDay,
      failedPerDay: perDay(true),
      busiest:
        most > 0
          ? { day: answer.days[sentPerDay.indexOf(most)].day, sent: most }
          : null,
    };
  });
}

/** Whether a service had any event at all over the month, sent or not. */
export function hadEvents(summary: ServiceSummary): boolean {
  return Object.values(summary.all.outcomes).some((count) => count > 0);
}

// Chart accents from `globals.css`, the stats page's set, one per service in turn.
// The legend names every service, so a colour repeating past ten is never the only
// thing telling two apart.
const SERVICE_COLOURS = [
  "text-coral",
  "text-teal",
  "text-ppo2",
  "text-ndl",
  "text-pressure",
  "text-surface-gradient-factor",
  "text-tts",
  "text-gradient-factor",
  "text-cns",
  "text-ceiling",
];

/** The daily chart's series: each service's sent requests per day. */
export function sentSeries(summaries: ServiceSummary[]): Series[] {
  return summaries.map((summary, index) => ({
    key: summary.provider,
    label: summary.provider,
    colour: SERVICE_COLOURS[index % SERVICE_COLOURS.length],
    values: summary.sentPerDay,
  }));
}

/** "340 ms", "2.4 s". */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "9,600". */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

const WINDOW_UNITS: Record<number, string> = {
  1: "a second",
  60: "a minute",
  3600: "an hour",
  86400: "a day",
};

/** "400 requests an hour", "1 request every 90 seconds". */
export function describeLimit(limit: AdminExternalRequestLimit): string {
  const requests = `${formatCount(limit.requests)} ${limit.requests === 1 ? "request" : "requests"}`;
  const unit = WINDOW_UNITS[limit.window_seconds];
  return unit
    ? `${requests} ${unit}`
    : `${requests} every ${formatCount(limit.window_seconds)} seconds`;
}
