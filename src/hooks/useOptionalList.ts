"use client";

import { useCallback, useEffect, useState } from "react";

import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/error";

/**
 * What a list request came back with. `absent` is an instance that answers the
 * route with 404 - an API predating the feature, or one where it does not apply,
 * like invitations on an `open` instance. That is not an error to report on a
 * settings page: it is a feature this copy of OpenDiving does not have, so the
 * card renders nothing.
 */
export type OptionalListState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "absent" }
  | { status: "failed"; message: string };

/**
 * Loads a settings card's list on mount, and again on `refresh`, mapping a 404 to
 * `absent` and any other failure to `failed` with the API's message or
 * `failedMessage`. `update` patches the loaded data in place - a rename, a
 * prepended row, the next page - and leaves any other state alone.
 *
 * `load` must keep its identity across renders - a module-level function - since
 * a new one reloads the list.
 */
export function useOptionalList<T>(
  load: () => Promise<T>,
  failedMessage: string,
) {
  const [list, setList] = useState<OptionalListState<T>>({
    status: "loading",
  });

  // A promise chain rather than `async`/`await`: it is called from the effect
  // below, and `react-hooks/set-state-in-effect` rejects a synchronous-looking
  // setState there.
  const refresh = useCallback(
    () =>
      load()
        .then((data) => setList({ status: "ready", data }))
        .catch((error: unknown) => {
          console.error(failedMessage, error);
          setList(
            getApiErrorStatus(error) === 404
              ? { status: "absent" }
              : {
                  status: "failed",
                  message: getApiErrorMessage(error, failedMessage),
                },
          );
        }),
    [load, failedMessage],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    (change: (data: T) => T) =>
      setList((current) =>
        current.status === "ready"
          ? { status: "ready", data: change(current.data) }
          : current,
      ),
    [],
  );

  return { list, refresh, update };
}
