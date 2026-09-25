import { apiClient, fetchAllPages } from "./client";
import type { PaginatedResponse } from "./client";

/**
 * What kind of servicing a schedule or record is about. Mirrors the API's `ServiceKind`
 * enum - a closed vocabulary rather than free text, so "VIP"/"vis"/"visual inspection"
 * don't end up as three different things in one diver's list.
 *
 * Declared in the order a diver is likely to reach for them rather than alphabetically:
 * this drives the picker's option order. Keep in sync with the API.
 */
export const SERVICE_KINDS = [
  "service",
  "visual_inspection",
  "hydrostatic_test",
  "battery",
  "oxygen_clean",
  "other",
] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number];

const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  service: "Service",
  visual_inspection: "Visual inspection",
  hydrostatic_test: "Hydrostatic test",
  battery: "Battery",
  oxygen_clean: "Oxygen cleaning",
  other: "Other",
};

/**
 * Label for a service kind, tolerating a value this build doesn't know about (an API
 * that has grown a new kind shouldn't render as a blank cell). Mirrors `gearTypeLabel`.
 */
export function serviceKindLabel(
  kind: string | null | undefined,
): string | null {
  if (!kind) return null;
  return SERVICE_KIND_LABELS[kind as ServiceKind] ?? kind;
}

/**
 * The kind, plus the free-text label when there is one. This is the pair the API itself
 * keys a schedule by - a logged service with no schedule attached is matched to "the one
 * schedule matching (item, kind, label)" - and it is what every service list leads with
 * on screen, so it is what a diver would use to say which row they mean.
 *
 * Shared rather than repeated: it names the icon-only row controls on both the gear
 * detail card and the dashboard's service-due card, and two copies of the phrasing is
 * how the same button ends up announced two different ways.
 */
export function serviceKindAndLabel(entry: {
  kind: string;
  label?: string | null;
}): string {
  const kind = serviceKindLabel(entry.kind) ?? entry.kind;
  return entry.label ? `${kind} (${entry.label})` : kind;
}

// The compact shape embedded in a `GearItem`, so the gear list can badge "service due"
// without a request per row.
//
// Note what is *not* here: a status. Status depends on today's date and would be stale
// inside a cached response, so it's derived in the browser - see `lib/gear-service.ts`.
export interface GearServiceScheduleSummary {
  uuid: string;
  kind: ServiceKind;
  label?: string | null;
  interval_months?: number | null;
  interval_dives?: number | null;
  last_service_on?: string | null;
  // "YYYY-MM-DD". Null when the schedule has no time-based interval.
  next_due_on?: string | null;
  // An absolute lifetime-dive-count threshold, not a remaining count. Null when the
  // schedule has no dive-based interval.
  next_due_at_dive_count?: number | null;
  is_active: boolean;
}

// A servicing rule: "this regulator needs a full service every 12 months or every 100
// dives, whichever comes first".
export interface GearServiceSchedule extends GearServiceScheduleSummary {
  // Baseline the first due date is measured from, until a service is logged against it.
  starts_on: string;
  dive_count_at_start: number;
  gear_item_uuid: string;
  user_uuid: string;
  created_at: string;
}

export interface GearServiceScheduleCreate {
  gear_item_uuid: string;
  kind: ServiceKind;
  starts_on: string;
  label?: string | null;
  interval_months?: number | null;
  interval_dives?: number | null;
}

export interface GearServiceScheduleUpdate {
  kind?: ServiceKind;
  label?: string | null;
  starts_on?: string;
  interval_months?: number | null;
  interval_dives?: number | null;
  // Pauses reminders without deleting the rule.
  is_active?: boolean;
}

// One servicing event that actually happened. Records outlive the rule they satisfied -
// deleting a reminder never throws away the receipts.
export interface GearServiceRecord {
  uuid: string;
  kind: ServiceKind;
  serviced_on: string;
  label?: string | null;
  // The shop that did the work, a contact by uuid; `performed_by` beside it names
  // the person - a technician, or "self".
  contact_uuid?: string | null;
  performed_by?: string | null;
  notes: string;
  // The item's lifetime dive count when the work was done - the baseline the next
  // dive-based threshold counts up from. Set server-side, never sent by the client.
  dive_count_at_service: number;
  gear_item_uuid: string;
  // Null when the record isn't attached to a schedule.
  gear_service_schedule_uuid?: string | null;
  user_uuid: string;
  created_at: string;
}

export interface GearServiceRecordCreate {
  gear_item_uuid: string;
  kind: ServiceKind;
  serviced_on: string;
  label?: string | null;
  contact_uuid?: string | null;
  performed_by?: string | null;
  notes?: string;
  // Optional: when omitted, the API links the one schedule matching (item, kind, label),
  // so "log the annual service" satisfies the reminder without picking anything.
  gear_service_schedule_uuid?: string | null;
}

// `null` on `contact_uuid` unlinks the shop; omitting it leaves the link alone.
export interface GearServiceRecordUpdate {
  kind?: ServiceKind;
  serviced_on?: string;
  label?: string | null;
  contact_uuid?: string | null;
  performed_by?: string | null;
  notes?: string;
}

// One row of the dashboard's "service due" card.
export interface GearServiceDueEntry {
  schedule_uuid: string;
  kind: ServiceKind;
  label?: string | null;
  last_service_on?: string | null;
  next_due_on?: string | null;
  next_due_at_dive_count?: number | null;
  gear_item_uuid: string;
  gear_item_name: string;
  gear_item_brand?: string | null;
  gear_item_dive_count: number;
}

export interface GearServiceDueResponse {
  data: GearServiceDueEntry[];
  // True when the API's row cap (`DUE_OVERVIEW_LIMIT`, 200) was hit, so this is not
  // all of them. Optional because a response cached before the field existed won't
  // carry it - and absent must read as "complete", not as a false alarm.
  truncated?: boolean;
}

/**
 * Views a dashboard entry as the schedule summary the status helpers take, so
 * `serviceStatus`/`formatServiceDue` work identically on the dashboard, the gear list
 * and the item detail card. Always `is_active: true` - the API only ever returns active
 * schedules from `/gear-service-due`.
 */
export function scheduleFromDueEntry(
  entry: GearServiceDueEntry,
): GearServiceScheduleSummary {
  return {
    uuid: entry.schedule_uuid,
    kind: entry.kind,
    label: entry.label,
    last_service_on: entry.last_service_on,
    next_due_on: entry.next_due_on,
    next_due_at_dive_count: entry.next_due_at_dive_count,
    is_active: true,
  };
}

export type PaginatedServiceSchedulesResponse =
  PaginatedResponse<GearServiceSchedule>;

export type PaginatedServiceRecordsResponse =
  PaginatedResponse<GearServiceRecord>;

/**
 * Service schedules and service history for gear items.
 *
 * A schedule says how often an item needs servicing; a record says when one actually
 * happened. Both are owned via their gear item, so one belonging to another user reads as
 * a 404 rather than a 403.
 */
export const gearServiceAPI = {
  async createSchedule(
    data: GearServiceScheduleCreate,
  ): Promise<GearServiceSchedule> {
    const response = await apiClient.post(`/gear-service-schedule`, data);
    return response.data;
  },

  async getSchedules(
    gearItemUuid?: string,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedServiceSchedulesResponse> {
    const response = await apiClient.get(`/gear-service-schedules`, {
      params: {
        gear_item_uuid: gearItemUuid,
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  async getSchedule(scheduleUuid: string): Promise<GearServiceSchedule> {
    const response = await apiClient.get(
      `/gear-service-schedule/${scheduleUuid}`,
    );
    return response.data;
  },

  async updateSchedule(
    scheduleUuid: string,
    updateData: GearServiceScheduleUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/gear-service-schedule/${scheduleUuid}`,
      updateData,
    );
    return response.data;
  },

  async deleteSchedule(scheduleUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(
      `/gear-service-schedule/${scheduleUuid}`,
    );
    return response.data;
  },

  async createRecord(
    data: GearServiceRecordCreate,
  ): Promise<GearServiceRecord> {
    const response = await apiClient.post(`/gear-service-record`, data);
    return response.data;
  },

  async getRecords(
    gearItemUuid?: string,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedServiceRecordsResponse> {
    const response = await apiClient.get(`/gear-service-records`, {
      params: {
        gear_item_uuid: gearItemUuid,
        page,
        items_per_page,
      },
    });
    return response.data;
  },

  async updateRecord(
    recordUuid: string,
    updateData: GearServiceRecordUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/gear-service-record/${recordUuid}`,
      updateData,
    );
    return response.data;
  },

  async deleteRecord(recordUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(
      `/gear-service-record/${recordUuid}`,
    );
    return response.data;
  },

  // Every active schedule the user owns - no date horizon, deliberately. A server-side
  // "due within N days" filter would bake today's date into the cached response, which
  // then goes wrong at midnight; the client buckets these itself.
  async getDue(): Promise<GearServiceDueResponse> {
    const response = await apiClient.get(`/gear-service-due`);
    return response.data;
  },
};

/**
 * Fetches every page of a gear item's service history. The detail card shows the full
 * list rather than paging it - a diver has a handful of records per item, not hundreds.
 */
export async function fetchAllServiceRecords(
  gearItemUuid: string,
  signal?: AbortSignal,
): Promise<GearServiceRecord[]> {
  return fetchAllPages(
    (page, itemsPerPage) =>
      gearServiceAPI.getRecords(gearItemUuid, page, itemsPerPage),
    { signal, label: "service records", keyOf: (record) => record.uuid },
  );
}
