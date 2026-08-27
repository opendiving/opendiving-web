"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useConfig } from "@/contexts/ConfigContext";
import { beginGoogleSignIn } from "@/lib/google-oauth";
import { hardNavigate } from "@/lib/navigation";
import { GoogleIcon } from "@/components/icons/google-icon";

interface GoogleAuthButtonProps {
  onError: (message: string) => void;
  // Where to land after a successful sign-in, when the visitor was headed
  // somewhere specific (see `useAuthGuard`/`AuthForm`). Handed to
  // `beginGoogleSignIn`, which stores it inside the attempt it mints: this flow
  // leaves the tab, so a prop alone would not survive the trip to Google.
  redirectTo?: string | null;
}

// "Continue with Google" - one of the alternatives to the email field on the
// single entry point into the app (see `AuthForm`).
//
// **Nothing of Google's is loaded to render this.** The button is an ordinary
// `Button`, and pressing it builds an authorization URL and navigates there (see
// `lib/google-oauth.ts`). A signed-out visitor who never presses it never
// contacts Google at all, which is the entire point: the press is the consent,
// and until it happens Google has not been given the visitor's IP address, their
// user agent, or an opportunity to set anything in their browser.
//
// This used to inject `https://accounts.google.com/gsi/client` at mount and stack
// Google's own rendered button on top of a custom visual at `opacity: 0`, so that
// clicks landed on the real button while nobody ever saw its pixels. All of that
// is gone: the overlay, the `ResizeObserver` that sized it, the `?hl=en` that
// forced the script's baked-in button language, and the accepted assumption about
// Google's internals that the whole arrangement rested on. With no injected
// button there is nothing to hide behind, so this is one real control carrying
// its own accessible name - one tab stop, operable by Enter and Space like any
// other button, none of which needed arranging.
//
// The "Or" divider above this lives in `AuthForm`: with more than one alternative
// method it has to be drawn once above whichever of them an instance has, and
// neither can own it.
//
// Google Identity Services never distinguished sign in from sign up, and neither
// does this - `POST /auth/google` transparently starts onboarding on first use
// instead of signing straight in.
export function GoogleAuthButton({
  onError,
  redirectTo,
}: GoogleAuthButtonProps) {
  // Runtime configuration, not a build-time constant: a published image has to be
  // able to learn its client ID from the container it runs in - see
  // `lib/runtime-config.ts`. Unset, the whole button renders nothing.
  const { googleClientId: clientId } = useConfig();
  const [isLeaving, setIsLeaving] = useState(false);

  // Renders nothing if Google sign-in hasn't been configured (no client ID),
  // rather than rendering a button that can never succeed.
  if (!clientId) {
    return null;
  }

  const handleClick = async () => {
    setIsLeaving(true);
    try {
      // A real page load, not a client-side route change - the destination is
      // another origin. `hardNavigate` also marks this document as on its way
      // out, which stands down any effect that would otherwise start a
      // navigation nobody will see.
      hardNavigate(await beginGoogleSignIn({ clientId, redirectTo }));
    } catch {
      // The only way this fails before leaving is `crypto.subtle` being
      // unavailable, which means a non-secure context. Nothing has been sent
      // anywhere, so the visitor can simply choose another method.
      setIsLeaving(false);
      onError("Couldn't start Google sign-in. Please try another method.");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={isLeaving}
    >
      {isLeaving ? (
        <div className="flex items-center space-x-2">
          <ButtonSpinner />
          <span>Redirecting...</span>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <GoogleIcon className="h-4 w-4" />
          <span>Continue with Google</span>
        </div>
      )}
    </Button>
  );
}
