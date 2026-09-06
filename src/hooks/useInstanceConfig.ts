"use client";

import { useEffect, useState } from "react";

import { configAPI, type InstanceConfig } from "@/lib/api/config";

interface InstanceConfigState {
  // `null` means "not known" - either the fetch is still in flight or it failed.
  // It is deliberately not defaulted to a config here: the one caller has a safe
  // answer for an unknown one (the sign-in form, in the copy that is true of any
  // instance) and that decision belongs at the call site rather than hidden
  // behind a default nobody can see.
  config: InstanceConfig | null;
  isLoading: boolean;
}

/**
 * What `GET /config` says about this instance: whether it lets anyone register
 * or hands out invitations, and whether the OpenDiving project is the one
 * running it. Handed back whole rather than field by field, so a caller that
 * needs two of its facts makes one request and decides from one answer.
 *
 * Read from the API rather than from this container's environment - see
 * `lib/api/config.ts` for why - and read once per mount rather than cached here:
 * the response is marked publicly cacheable for a minute, so the browser's own
 * cache is what stops a repeat load from asking again. Nothing is written to
 * browser storage for it; every key this app writes has to be registered and
 * named on `/privacy` §10, and a value this cheap to fetch does not earn one.
 *
 * A failure resolves to `null`, not to a config. The landing page must still work
 * on an instance whose API is briefly down, and what it shows for an unknown
 * config is the sign-in form - the answer that is right on any instance.
 */
export function useInstanceConfig(): InstanceConfigState {
  const [state, setState] = useState<InstanceConfigState>({
    config: null,
    isLoading: true,
  });

  useEffect(() => {
    let active = true;

    // A promise chain rather than `async`/`await` inside the effect, the shape
    // `SessionsCard.refresh` uses for the same lint rule.
    configAPI
      .getInstanceConfig()
      .then((config) => {
        if (active) setState({ config, isLoading: false });
      })
      .catch((error: unknown) => {
        console.error("Couldn't read this instance's configuration.", error);
        if (active) setState({ config: null, isLoading: false });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
