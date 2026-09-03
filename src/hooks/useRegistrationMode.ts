"use client";

import { useEffect, useState } from "react";

import { configAPI, type RegistrationMode } from "@/lib/api/config";

interface RegistrationModeState {
  // `null` means "not known" - either the fetch is still in flight or it failed.
  // It is deliberately not defaulted to a mode here: the one caller has a safe
  // answer for an unknown mode (show the sign-in form, which works on any
  // instance) and that decision belongs at the call site rather than hidden
  // behind a default nobody can see.
  mode: RegistrationMode | null;
  isLoading: boolean;
}

/**
 * Whether this instance lets anyone register or hands out invitations.
 *
 * Read from the API rather than from this container's environment - see
 * `lib/api/config.ts` for why - and read once per mount rather than cached here:
 * the response is marked publicly cacheable for a minute, so the browser's own
 * cache is what stops a repeat load from asking again. Nothing is written to
 * browser storage for it; every key this app writes has to be registered and
 * named on `/privacy` §10, and a value this cheap to fetch does not earn one.
 *
 * A failure resolves to `null`, not to a mode. The landing page must still work
 * on an instance whose API is briefly down, and the form it shows for an unknown
 * mode is the sign-in form.
 */
export function useRegistrationMode(): RegistrationModeState {
  const [state, setState] = useState<RegistrationModeState>({
    mode: null,
    isLoading: true,
  });

  useEffect(() => {
    let active = true;

    // A promise chain rather than `async`/`await` inside the effect, the shape
    // `SessionsCard.refresh` uses for the same lint rule.
    configAPI
      .getInstanceConfig()
      .then((config) => {
        if (active)
          setState({ mode: config.registration_mode, isLoading: false });
      })
      .catch((error: unknown) => {
        console.error("Couldn't read this instance's configuration.", error);
        if (active) setState({ mode: null, isLoading: false });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
