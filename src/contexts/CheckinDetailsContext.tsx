"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  checkinDetailsAPI,
  type CheckinDetails,
  type CheckinDetailsUpdate,
} from "@/lib/api/checkin-details";
import { isAbortError } from "@/lib/api/client";

export interface CheckinDetailsState {
  /** The diver's check-in details, or `null` until the first read lands. */
  details: CheckinDetails | null;
  /** Whether the last read failed. */
  loadFailed: boolean;
  /** Reads them again, after something other than `save` wrote them - an import. */
  reload: () => void;
  /**
   * Sends the members `patch` carries and nothing else, and replaces the shared copy
   * with the whole object the API answers. Rejects as the request does.
   */
  save: (patch: CheckinDetailsUpdate) => Promise<CheckinDetails>;
}

interface ContextValue extends CheckinDetailsState {
  want: () => void;
}

const CheckinDetailsContext = createContext<ContextValue | undefined>(
  undefined,
);

/**
 * The one copy of the signed-in diver's check-in details, for every surface that shows
 * or saves them: the settings cards, the sheet and its dialogs, the bell's insurance
 * rows, the import preview. One copy rather than a read per surface, so a save on any
 * of them is what every other one shows at once.
 *
 * The copy is what a surface shows and never what it sends: a save sends the group the
 * diver edited, and the answer replaces the copy.
 *
 * Reads nothing until the first consumer mounts, and again when the account changes.
 */
export function CheckinDetailsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userUuid = user?.uuid ?? null;
  const [wanted, setWanted] = useState(false);
  // Held with the account it belongs to, so a copy read for one account is never
  // shown to the next one signed in on this tab.
  const [held, setHeld] = useState<{
    uuid: string;
    details: CheckinDetails;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped by every save, so a read that set out before one cannot land after it and
  // put back what the save replaced.
  const generation = useRef(0);

  useEffect(() => {
    if (!wanted || !userUuid) return;
    const controller = new AbortController();
    const started = generation.current;
    checkinDetailsAPI
      .get(controller.signal)
      .then((details) => {
        if (controller.signal.aborted || generation.current !== started) return;
        setHeld({ uuid: userUuid, details });
        setFailedFor(null);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        console.error("Failed to read the check-in details:", error);
        setFailedFor(userUuid);
      });
    return () => controller.abort();
  }, [wanted, userUuid, reloadKey]);

  const want = useCallback(() => setWanted(true), []);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const save = useCallback(
    async (patch: CheckinDetailsUpdate) => {
      generation.current += 1;
      const details = await checkinDetailsAPI.update(patch);
      if (userUuid) {
        setHeld({ uuid: userUuid, details });
        setFailedFor(null);
      }
      return details;
    },
    [userUuid],
  );

  const details =
    held && userUuid && held.uuid === userUuid ? held.details : null;
  const loadFailed = !!userUuid && failedFor === userUuid;

  const value = useMemo(
    () => ({ details, loadFailed, reload, save, want }),
    [details, loadFailed, reload, save, want],
  );

  return (
    <CheckinDetailsContext.Provider value={value}>
      {children}
    </CheckinDetailsContext.Provider>
  );
}

/**
 * The signed-in diver's check-in details, from the one copy `CheckinDetailsProvider`
 * holds. The first caller to mount is what starts the read.
 *
 * Nothing should offer a Save or open an editing dialog over these while `details` is
 * `null`: a form seeded from a copy that never arrived would send its own group empty,
 * and clear it.
 */
export function useCheckinDetails(): CheckinDetailsState {
  const context = useContext(CheckinDetailsContext);
  if (context === undefined) {
    throw new Error(
      "useCheckinDetails must be used within a CheckinDetailsProvider",
    );
  }
  const { want, ...state } = context;
  useEffect(() => want(), [want]);
  return state;
}
