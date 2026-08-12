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
};
