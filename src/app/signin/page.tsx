import type { Metadata } from "next";

import { SignInPageContent } from "@/components/auth/signin-page-content";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage() {
  return <SignInPageContent />;
}
