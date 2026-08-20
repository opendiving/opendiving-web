"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { usePasskeyRegistration } from "@/hooks/usePasskeyRegistration";
import { passkeysAPI } from "@/lib/api/passkeys";
import {
  dismissPasskeyNudge,
  isPasskeyNudgeDismissed,
} from "@/lib/passkey-nudge";

/**
 * "Sign in faster next time - add a passkey", on the dashboard, once.
 *
 * Passkeys are worth almost nothing to a diver who never finds them, and the
 * settings card only reaches people already looking. This is the other half: an
 * offer where they already are, dismissible, and gone for good once taken.
 *
 * Three conditions, checked in this order because the last one costs a request:
 * the browser can create a passkey, this browser has not been told "not now",
 * and the account has none yet. So the steady state - a diver who dismissed it,
 * or who has a passkey - is no network call at all.
 *
 * Adding runs the ceremony straight from the click, which is the user gesture
 * Safari requires for `credentials.create()`. Nothing here fires on its own; an
 * unprompted biometric prompt on a dashboard would be alarming, not helpful.
 */
export function PasskeyNudgeCard() {
  const { toast } = useToast();
  // Starts hidden and is only ever turned *on*, by the list request below. That
  // is what keeps the card out of the server's markup and out of hydration's
  // way, and it means every reason not to show it - an unsupported browser, a
  // dismissal, a failed request - needs no state of its own.
  const [offer, setOffer] = useState(false);

  const registration = usePasskeyRegistration({
    onRegistered: useCallback(() => {
      setOffer(false);
      toast({
        title: "Passkey added",
        description:
          "Next time, signing in is one tap. Manage it under Settings.",
      });
    }, [toast]),
    onError: useCallback(
      (message: string) =>
        toast({ title: "Error", description: message, variant: "destructive" }),
      [toast],
    ),
  });

  const { supported } = registration;

  useEffect(() => {
    // The two free checks first: the account is only asked about its passkeys
    // where the answer could lead somewhere, so a diver who dismissed this makes
    // no request on any later dashboard visit.
    if (!supported || isPasskeyNudgeDismissed()) return;

    let cancelled = false;
    passkeysAPI
      .getPasskeys()
      .then((passkeys) => {
        if (!cancelled && passkeys.length === 0) setOffer(true);
      })
      // A supplementary card, like the rest of the dashboard's: an API with no
      // passkey routes at all 404s here, and neither that nor a failed request
      // is worth turning into an error the diver can do nothing with. The card
      // simply stays away.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!offer) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Sign in faster next time — add a passkey
            </p>
            <p className="text-sm text-muted-foreground">
              Your fingerprint, face or device PIN, instead of waiting for an
              email. Your email link keeps working either way.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              dismissPasskeyNudge();
              setOffer(false);
            }}
          >
            Not now
          </Button>
          <Button
            size="sm"
            onClick={registration.register}
            disabled={registration.isRegistering}
          >
            {registration.isRegistering && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Add a passkey
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
