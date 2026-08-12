"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  DEFAULT_POST_AUTH_REDIRECT,
  sanitizeRedirectPath,
} from "@/lib/auth-redirect";
import { GoogleIcon } from "@/components/icons/google-icon";

interface GoogleAuthButtonProps {
  onError: (message: string) => void;
  // Where to land after a successful sign-in, when the visitor was headed
  // somewhere specific (see `useAuthGuard`/`AuthForm`). Unlike the email flow
  // this never leaves the tab, so it's just a prop - nothing to persist.
  redirectTo?: string | null;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      shape?: "rectangular" | "pill" | "circle" | "square";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

// Google's Identity Services script auto-detects the button's *language* from the
// browser/Google session locale, and bakes that choice into the script response
// itself - overriding it needs an `hl` query parameter on this URL, not just the
// `locale` field `google.accounts.id.renderButton()` otherwise accepts (which,
// empirically, isn't enough on its own - see `DECISIONS.md`). Hardcoded to English
// since the rest of this app has no i18n; a German (or any other) browser locale
// would otherwise render "Mit Google anmelden" on just this one button while every
// other string on the page is always English.
const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client?hl=en";

// Module-level, not component state: every `GoogleAuthButton` instance (there's
// only ever one on screen, but this also protects against Strict Mode's dev-only
// double-invoked effects) must share the same script load rather than each
// appending its own `<script>` tag.
let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Identity Services"));
      document.body.appendChild(script);
    });
  }
  return gsiScriptPromise;
}

// Renders a fully custom "Continue with Google" button - the other half of the
// single entry point into the app (see `AuthForm`). Google Identity Services
// doesn't distinguish sign in from sign up (there's one button, one credential),
// so `useAuth().signInWithGoogle` (backed by `POST /auth/google`) transparently
// starts onboarding on first use instead of signing straight in.
//
// This talks to Google's `google.accounts.id` JS API directly, deliberately
// bypassing `@react-oauth/google`'s own `GoogleLogin`/`GoogleOAuthProvider` - that
// library always loads the *unlocalized* script URL with no way to add the `hl`
// query parameter above, which made every attempt to force English via its
// `locale` prop alone ineffective. See `DECISIONS.md` for the full story.
//
// `google.accounts.id.renderButton()` - the only way to trigger the credential
// flow from a button click - has no config for border radius, and always draws a
// light backing chip behind the multicolor "G" logo on its dark themes (neither
// is reachable via config or CSS; earlier attempts to live within those limits
// are in `DECISIONS.md`). So this renders a fully custom, `Button`-styled visual
// (own SVG "G" logo, exact `rounded-md` corners, follows the app's theme like
// any other button) with GSI's *real* rendered button stacked exactly on top of
// it at `opacity: 0` - clicks land on the real, invisible button, but nobody ever sees
// its actual pixels. `:hover`/`:focus-within` on the shared wrapper (`group`)
// naturally reflect interaction with that real button and drive the visual
// button's hover/focus-ring styling, since CSS `:hover`/`:focus-within` bubble to
// ancestors regardless of which descendant (including a focused cross-origin
// `<iframe>`) actually has the pointer/focus - see `DECISIONS.md`.
export function GoogleAuthButton({
  onError,
  redirectTo,
}: GoogleAuthButtonProps) {
  const { signInWithGoogle } = useAuth();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [ready, setReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // `callback` is only ever registered once (see the `initialize` effect below),
  // so it needs a stable identity that still calls the *latest* version of this -
  // a ref avoids re-running that effect (and re-calling `initialize`) every time
  // `signInWithGoogle`/`router`/`onError` happen to change identity. Updated from
  // an effect, not during render, per this project's `react-hooks/refs` lint rule.
  const handleCredentialRef = useRef<(credential: string) => void>(() => {});
  useEffect(() => {
    handleCredentialRef.current = async (credential: string) => {
      try {
        const signedIn = await signInWithGoogle(credential);
        router.push(
          signedIn
            ? (sanitizeRedirectPath(redirectTo) ?? DEFAULT_POST_AUTH_REDIRECT)
            : "/onboarding",
        );
      } catch (err) {
        onError(
          getApiErrorMessage(err, "An error occurred during Google sign in"),
        );
      }
    };
  });

  // The invisible real button still needs a concrete pixel width from GSI's own
  // 200-400 range (not a CSS percentage) to fill the same area as the visible
  // custom button sitting under it - measure the shared wrapper (which both
  // absolutely-positioned layers fill via `inset-0`) and keep it in sync as that
  // changes (e.g. the viewport being resized).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () =>
      setWidth(Math.round(Math.min(400, Math.max(200, el.offsetWidth))));
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Loads the script and calls `initialize` exactly once - it only needs the
  // stable `client_id` and a callback, so there's nothing to re-run it for later.
  // Calling `initialize` more than once for the same, unchanged config is what
  // triggers GSI's own "called multiple times" console warning (see
  // `DECISIONS.md`); this structure avoids ever doing that, rather than just
  // tolerating it.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGsiScript().then(() => {
      if (cancelled) return;
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (!response.credential) {
            onError("Google sign-in did not return a credential.");
            return;
          }
          handleCredentialRef.current(response.credential);
        },
      });
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [clientId, onError]);

  // Unlike `initialize`, `renderButton` is meant to be called again whenever the
  // button's own size needs to change - each call replaces its target element's
  // contents, so this re-runs whenever the measured width changes. `theme`/
  // `shape`/`logo_alignment` don't matter here (this button is never seen), but
  // are still passed for a correct accessible name/size regardless.
  useEffect(() => {
    if (!ready || !width || !containerRef.current) return;
    window.google!.accounts.id.renderButton(containerRef.current, {
      theme: "outline",
      shape: "rectangular",
      text: "continue_with",
      logo_alignment: "center",
      width,
    });
  }, [ready, width]);

  // Renders nothing if Google sign-in hasn't been configured (no client ID),
  // rather than rendering a button that can never succeed.
  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <div className="group relative h-10 w-full">
        {/* Fully custom, purely decorative button - matches `Button`'s own
            outline styling exactly. Hidden from assistive technology: the real
            button below carries the actual accessible name/role. The focus ring
            uses `group-has-[:focus-visible]`, not `group-focus-within` - the
            latter would also (undesirably) show it after an ordinary mouse
            click, since clicking a button focuses it too; `:focus-visible`
            matches only when the browser judges the focus as keyboard-driven,
            the same distinction a native `<button>` gets for free - see
            `DECISIONS.md`. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-sm font-medium text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring group-has-[:focus-visible]:ring-offset-2"
        >
          <GoogleIcon className="h-4 w-4" />
          <span>Continue with Google</span>
        </div>

        {/* The real, functional Google button - invisible, but on top, so it
            receives every click/hover/keyboard interaction. */}
        <div ref={containerRef} className="absolute inset-0 z-10 opacity-0" />
      </div>
    </div>
  );
}
