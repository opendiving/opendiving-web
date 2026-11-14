"use client";

import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { experimentalFeatureOn } from "@/lib/api/config";

interface ExperimentalFeatureState {
  isOn: boolean;
  isLoading: boolean;
}

/**
 * Whether this instance switches the named experimental feature on, as
 * `GET /config` reports it - the API is the only source, never this container's
 * environment. `isOn` is false until the config has answered, and stays false
 * when the read fails, so a page holds its loading frame while `isLoading` and
 * then renders the not-found state on `!isOn`.
 *
 * Built on `useInstanceConfig`, so a test that mocks that hook supplies this one's
 * answer through the config it returns.
 */
export function useExperimentalFeature(name: string): ExperimentalFeatureState {
  const { config, isLoading } = useInstanceConfig();
  return { isOn: experimentalFeatureOn(config, name), isLoading };
}
