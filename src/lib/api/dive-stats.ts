import { apiClient } from "./client";
import type { DiveGasUse } from "./dives";

export interface UserDiveStats {
  user_uuid: string;
  total_dives: number;
  max_depth: number;
  total_time: number; // seconds
  species_seen: number;
  created_at: string;
}

// One dive's entry in the gas-use history series. Only dives that record enough
// to derive a figure appear at all, so `gas_use` is always present here - unlike
// on `Dive`, where it's optional.
export interface DiveGasUsePoint {
  dive_uuid: string;
  dive_number: number;
  // The dive's own offset-aware start time, same convention as `Dive.start_time`.
  start_time: string;
  avg_depth: number;
  gas_use: DiveGasUse;
}

// One calendar day of the diver's logbook, counted in the dives' own local time -
// so a dive keeps the day it was logged on, wherever it's read from.
//
// Days rather than months because the card windows this one series three ways -
// day by day, month by month, year by year - and sums the finer buckets into the
// coarser ones itself (`activityBars`). One row per day dived, so the series is
// bounded by the diving and stays smaller than the gas history the same dashboard
// already fetches.
//
// Only days containing dives are sent. The chart draws a fixed grid (a month's
// days, twelve months, or every year of a career) and fills its own gaps, so an
// empty bucket would be padding one shape into a different one.
export interface DiveActivityPoint {
  year: number;
  // 1-12, not the 0-11 `Date` uses. It's the API's number, and re-basing it here
  // would leave two conventions in play across the module boundary; the chart
  // converts where it builds dates.
  month: number;
  day: number;
  dives: number;
}

/**
 * Aggregate dive statistics for the signed-in user. A diver with no dives logged gets
 * zeroed-out stats rather than a 404, so callers needn't special-case the empty state.
 */
export const diveStatsAPI = {
  // Get the signed-in caller's own aggregate dive stats (total dives, max depth,
  // total time, species seen). Always operates on the caller's own account - no
  // uuid parameter.
  async getDiveStats(): Promise<UserDiveStats> {
    const response = await apiClient.get("/user/dive-stats");
    return response.data;
  },

  // The caller's whole gas-use series, oldest first - not paginated, because the
  // point of it is the trend across a diving career. Sized for a chart: a few
  // hundred small objects for a typical log, and the API caches it.
  async getGasUseHistory(): Promise<DiveGasUsePoint[]> {
    const response = await apiClient.get("/user/gas-use-history");
    return response.data;
  },

  // How many dives the caller logged on each calendar day, oldest first. One
  // small object per day with diving in it - a few kilobytes for an active
  // career, and strictly less than `getGasUseHistory` above, so this is a single
  // request rather than a page, and the API caches it.
  async getDiveActivity(): Promise<DiveActivityPoint[]> {
    const response = await apiClient.get("/user/dive-activity");
    return response.data;
  },
};
