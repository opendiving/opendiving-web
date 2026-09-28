import { apiClient } from "./client";

/**
 * What the account's uploads occupy on this instance, as `GET /user/storage`
 * reports it. Every figure is bytes **as stored**: a dive-computer file stored
 * compressed counts its compressed size, which is less than the `byte_size` its
 * recording lists, while one stored before compression arrived counts its full
 * size. Card images and pictures count their own sizes. Species photographs are
 * the shared catalogue's and appear nowhere here.
 *
 * `used_bytes` is the sum of the three parts. `limit_bytes` is `null` when the
 * instance sets no limit, and then nothing is ever refused for space.
 */
export interface StorageUsage {
  used_bytes: number;
  limit_bytes: number | null;
  dive_files_bytes: number;
  certification_files_bytes: number;
  pictures_bytes: number;
}

export const storageAPI = {
  /**
   * The caller's stored bytes, by kind, against the instance's limit. Uncached
   * on the API side, so a figure read after an upload or a delete includes it.
   */
  async getUsage(): Promise<StorageUsage> {
    const response = await apiClient.get<StorageUsage>("/user/storage");
    return response.data;
  },
};
