"use client";

import { CSPProvider } from "@base-ui/react/csp-provider";

interface NonceProviderProps {
  nonce?: string;
  children: React.ReactNode;
}

export function NonceProvider({ nonce, children }: NonceProviderProps) {
  return <CSPProvider nonce={nonce}>{children}</CSPProvider>;
}
