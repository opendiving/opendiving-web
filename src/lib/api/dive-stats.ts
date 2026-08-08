import { apiClient } from "./client";

export interface UserDiveStats {
  user_uuid: string;
  total_dives: number;
  max_depth: number;
  total_time: number; // seconds
  species_seen: number;
  created_at: string;
}

export const diveStatsAPI = {
  // Get the signed-in caller's own aggregate dive stats (total dives, max depth,
  // total time, species seen). Always operates on the caller's own account - no
  // uuid parameter.
  async getDiveStats(): Promise<UserDiveStats> {
    const response = await apiClient.get("/user/dive-stats");
    return response.data;
  },
};
