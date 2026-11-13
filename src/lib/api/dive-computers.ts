import { apiClient } from "./client";

/**
 * One dive computer of the account, at its place in the account's order, as
 * `GET /dive-computers` lists it.
 *
 * A computer is a serial: one the account's recordings name, or one the diver
 * placed in the order before any recording of it arrived - and then `brand`,
 * `model` and `name` are all null. Two serials equal once trimmed and
 * case-folded are one computer. `position` is 0 for the first.
 */
export interface DiveComputer {
  serial: string;
  brand: string | null;
  model: string | null;
  name: string | null;
  position: number;
}

/**
 * The account's dive computers and their order. Where two of them recorded one
 * dive, the recording of the one higher in the order is shown by default when
 * the second arrives; changing the order changes no dive already stored.
 *
 * An instance whose API predates the list 404s on it, which the settings card
 * reads as a feature this copy does not have.
 */
export const diveComputersAPI = {
  /** Every computer, first to last; an empty list for an account with none. */
  async getDiveComputers(): Promise<DiveComputer[]> {
    const response = await apiClient.get<DiveComputer[]>("/dive-computers");
    return response.data;
  },

  /**
   * Replaces the whole order with `serials`, first to last, and answers the list
   * as `getDiveComputers` then reads it. A repeated serial is a 422.
   */
  async setOrder(serials: string[]): Promise<DiveComputer[]> {
    const response = await apiClient.put<DiveComputer[]>(
      "/dive-computers/order",
      { serials },
    );
    return response.data;
  },
};
