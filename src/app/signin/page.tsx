"use client";

import { SignInForm } from "@/components/auth/SignInForm";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { Waves } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <Waves className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">OpenDiving</span>
          </Link>
        </div>

        {/* Sign In Form */}
        <SignInForm />

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            By signing in, you agree to our{" "}
            <Link href="/terms" className="text-primary hover:text-primary/80">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:text-primary/80">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
