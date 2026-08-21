"use client";

import { createContext, useContext, type ReactNode } from "react";
import { tileSource } from "@/lib/map-tiles";
import type { PublicConfig } from "@/lib/runtime-config";

/**
 * What the browser gets before anything is configured.
 *
 * This is the context's default value, not a fallback for a missing provider: the
 * provider is mounted in the root layout, so every render inside the app has one. It
 * matters for component tests, which render a single component with no layout around
 * it - and what they should see is exactly what an instance that configures nothing
 * shows, which is this.
 */
const UNCONFIGURED: PublicConfig = {
  tiles: tileSource(),
};

const ConfigContext = createContext<PublicConfig>(UNCONFIGURED);

interface ConfigProviderProps {
  config: PublicConfig;
  children: ReactNode;
}

/**
 * Carries the instance's configuration from the server, where it is read
 * (`lib/runtime-config.ts`), to the client components that need it.
 *
 * The value crosses as a plain prop on the RSC payload, which is why everything in
 * `PublicConfig` has to be serializable - and why it is a deliberately chosen subset
 * rather than the whole configuration.
 */
export function ConfigProvider({ config, children }: ConfigProviderProps) {
  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}

/** This instance's browser-visible configuration. */
export function useConfig(): PublicConfig {
  return useContext(ConfigContext);
}
