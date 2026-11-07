"use client";

import { createContext, useContext } from "react";

// False with no provider: a page rendered on its own was sent by nobody.
export const ProposeOnArrivalContext = createContext<(uuid: string) => boolean>(
  () => false,
);

/**
 * Whether the header's form just made this site with Public chosen, which sends the
 * diver to the site's page for the flow to open there. Asking spends the answer.
 */
export function useProposeOnArrival() {
  return useContext(ProposeOnArrivalContext);
}
