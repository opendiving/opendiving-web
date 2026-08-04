import { apiClient } from "./client";

export interface UserDiveStats {
  user_id: number;
  total_dives: number;
  max_depth: number;
  total_time: number; // seconds
  species_seen: number;
  created_at: string;
}

export const diveStatsAPI = {
  // Get a user's aggregate dive stats (total dives, max depth, total time, species seen)
  async getDiveStats(username: string): Promise<UserDiveStats> {
    const response = await apiClient.get(`/${username}/dive-stats`);
    return response.data;
  },
};
