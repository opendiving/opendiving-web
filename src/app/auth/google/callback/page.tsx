"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import { getApiErrorMessage } from "@/lib/api/error";
import { destinationForOutcome, signInHref } from "@/lib/auth-redirect";
import { consumeGoogleAttempt, googleRedirectUri } from "@/lib/google-oauth";
import { AlertCircle, Loader2 } from "lucide-react";

// Where Google returns a visitor who pressed "Continue with Google" - this is
// `{FRONTEND_URL}/auth/google/callback`, the redirect URI the API derives and the
// one an operator registers against their OAuth client.
//
// **It exchanges on load rather than waiting for a click, and the reason
// `/auth/verify` does the opposite does not apply here.** That page requires an
// explicit click because its URL arrives by email, and a mail client's
// link-preview scanner can load it in a real, JS-executing browser. An OAuth
// callback URL is never emailed. It is reached only by a redirect from Google, at
// the end of something the visitor started in this browser moments earlier, and
// it carries a code that is worthless without the API's client secret and the
// PKCE verifier this browser kept to itself. Asking for a second click here would
// buy nothing and cost every visitor an extra step.
export default function GoogleCallbackPage() {
  return (
    // `useSearchParams` needs one, or `next build` fails the route - the same
    // shape `/auth/verify` has.
    <Suspense fallback={<CallbackStatus />}>
      <GoogleCallbackContent />
    </Suspense>
  );
}

const SIGN_IN_FAILED = "We couldn't finish signing you in with Google.";
const UNKNOWN_ATTEMPT =
  "This sign-in didn't come from a Google sign-in started in this browser, or it took too long to come back.";

function GoogleCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const state = searchParams.get("state");
  const code = searchParams.get("code");

  // The once-guard, and deliberately not the consumption of the stored attempt.
  // Google's authorization codes are single-use and React Strict Mode invokes
  // effects twice in development, so something has to stop the second invocation
  // from posting the same code again. Consuming the attempt before the request
  // looks like it does that and does not: the second mount would then find no
  // attempt and report a failure over a sign-in that had just succeeded - a
  // spurious error screen in the environment developers use, while a "confirm
  // exactly one POST" check still passed. A ref survives the remount, so the
  // second invocation returns before touching anything.
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    // Cancelling at Google's account chooser comes back as
    // `error=access_denied`, and it is a decision rather than a failure: the
    // visitor is put back on the sign-in page with every method still available
    // and nothing phrased as though something went wrong. The attempt is
    // consumed on the way past so an abandoned one does not sit in storage, and
    // its destination is carried back into the sign-in link so a second try
    // still lands where the first one was headed.
    if (errorParam) {
      const abandoned = consumeGoogleAttempt(state);
      router.replace(signInHref(abandoned?.redirectTo));
      return;
    }

    const attempt = consumeGoogleAttempt(state);
    if (!code || !attempt) {
      // No exchange at all. A `state` this browser did not issue, has already
      // used, or let expire is the one case where a code must not be posted -
      // the request would otherwise be this page doing a stranger's bidding.
      //
      // The one setState the rule has a point about, and it is unavoidable
      // rather than lazy: the verdict is only knowable after reading browser
      // storage, which is a side effect and so cannot happen during render the
      // way `/auth/verify` decides its own missing-token case. Every other
      // outcome here already reports from a promise continuation, which is the
      // shape the rule asks for. The cascade it costs is one render on a page
      // that has nothing further to do.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(UNKNOWN_ATTEMPT);
      return;
    }

    signInWithGoogle({
      code,
      codeVerifier: attempt.codeVerifier,
      // Rebuilt from the same derivation the authorization request used, because
      // Google requires the exchange to repeat the URI it saw and the API
      // refuses any other.
      redirectUri: googleRedirectUri(),
    })
      .then((outcome) => {
        // `replace`, not `push`: the code is in this page's own URL, and a
        // pushed entry would leave it in the visitor's history to be walked back
        // to. Every departure from this page replaces, including the error
        // card's link below.
        router.replace(
          destinationForOutcome(outcome.status, attempt.redirectTo),
        );
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, SIGN_IN_FAILED));
      });
  }, [errorParam, state, code, router, signInWithGoogle]);

  return <CallbackStatus error={error} />;
}

function CallbackStatus({ error }: { error?: string | null }) {
  return (
    <StandaloneShell className="text-center">
      {error ? (
        <>
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <p className="text-foreground font-medium mb-1">
            We couldn&rsquo;t sign you in
          </p>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link
            replace
            href="/signin"
            className="underline hover:text-foreground"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Signing you in...</p>
        </>
      )}
    </StandaloneShell>
  );
}
