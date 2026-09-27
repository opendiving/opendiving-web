import type { Metadata } from "next";

import { GoogleCallbackPageContent } from "@/components/auth/google-callback-page-content";

export const metadata: Metadata = { title: "Sign In" };

export default function GoogleCallbackPage() {
  return <GoogleCallbackPageContent />;
}
