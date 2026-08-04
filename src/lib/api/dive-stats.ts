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
  async getDiveStats(userId: number): Promise<UserDiveStats> {
    const response = await apiClient.get(`/dive-stats`, {
      params: { user_id: userId },
    });
    return response.data;
  },
};
