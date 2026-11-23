"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, LinkIcon, Plus } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { LandingPage } from "@/components/layout/landing-page";
import { PersonDialog } from "@/components/people/person-dialog";
import { CONNECT_LINK_PANE_HREF } from "@/components/people/connect-link-pane";
import type { ConnectTarget } from "@/components/people/connected-account-head";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/page-spinner";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  connectLinksAPI,
  type ConnectLinkOwner,
  type ConnectLinkOwnerForYou,
} from "@/lib/api/connect-links";

// Who is asking decides which read answers: signed out, the anonymous one, which
// never answers the username; signed in, the one that also says where the diver
// stands with the owner.
type Read<T> =
  | { status: "loading" }
  | { status: "live"; owner: T }
  | { status: "gone" }
  | { status: "failed" };

function useRead<T>(
  token: string,
  read: ((token: string) => Promise<T | null>) | null,
  attempt: number,
): Read<T> {
  const [result, setResult] = useState<{
    for: unknown;
    read: Read<T>;
  } | null>(null);

  useEffect(() => {
    if (!read) return;
    let active = true;
    // A promise chain for `react-hooks/set-state-in-effect`.
    read(token)
      .then((owner) => {
        if (!active) return;
        setResult({
          for: read,
          read: owner ? { status: "live", owner } : { status: "gone" },
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Failed to read this connect link:", error);
        setResult({ for: read, read: { status: "failed" } });
      });
    return () => {
      active = false;
    };
  }, [token, read, attempt]);

  // Keyed on the read it answered, so signing in shows the signed-in read loading
  // rather than the signed-out one's answer.
  if (!read || result?.for !== read) return { status: "loading" };
  return result.read;
}

// The page a connect link opens, `/connect/<token>`. Its response is the same
// page whatever the token, so a status says nothing about one; what the token
// names is asked of the API in the browser.
export function ConnectPage({ token }: { token: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [attempt, setAttempt] = useState(0);

  const signedOut = useRead<ConnectLinkOwner>(
    token,
    !isLoading && !isAuthenticated ? connectLinksAPI.resolve : null,
    attempt,
  );
  const signedIn = useRead<ConnectLinkOwnerForYou>(
    token,
    !isLoading && isAuthenticated ? connectLinksAPI.resolveForYou : null,
    attempt,
  );

  if (isLoading) return <PageSpinner className="bg-background" />;

  if (!isAuthenticated) {
    if (signedOut.status === "loading") {
      return <PageSpinner className="bg-background" />;
    }
    // A dead link, or an API that did not answer, is the landing page as it is:
    // the page the visitor would have reached anyway.
    return signedOut.status === "live" ? (
      <LandingPage
        connectLink={{
          token,
          ownerName: signedOut.owner.name,
          avatarSha: signedOut.owner.avatar_sha256 ?? null,
        }}
      />
    ) : (
      <LandingPage />
    );
  }

  if (signedIn.status === "loading") return <PageSpinner variant="inset" />;

  if (signedIn.status === "gone") {
    return (
      <Notice icon={<LinkIcon className="h-6 w-6 text-muted-foreground" />}>
        <h1 className="text-2xl font-semibold">
          This connect link is no longer active
        </h1>
        <p className="text-muted-foreground">
          It was reset or removed. Ask whoever gave it to you for their new one.
        </p>
      </Notice>
    );
  }

  if (signedIn.status === "failed") {
    return (
      <Notice
        icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
      >
        <h1 className="text-2xl font-semibold">
          This connect link didn&rsquo;t load
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </Button>
      </Notice>
    );
  }

  return <SignedInConnect token={token} owner={signedIn.owner} />;
}

function SignedInConnect({
  token,
  owner,
}: {
  token: string;
  owner: ConnectLinkOwnerForYou;
}) {
  // The person this visit connected, which the read that opened the page could
  // not know.
  const [saved, setSaved] = useState<string | null>(null);
  const personUuid = saved ?? owner.person_uuid ?? null;
  const offersForm = !owner.is_yours && !personUuid;
  const [isFormOpen, setIsFormOpen] = useState(offersForm);

  const connecting = useMemo<ConnectTarget>(
    () => ({
      via: "link",
      token,
      name: owner.name,
      username: owner.username,
      avatarSha: owner.avatar_sha256 ?? null,
    }),
    [token, owner],
  );

  const picture = (
    <UserAvatar
      name={owner.name}
      avatarSha={owner.avatar_sha256}
      source={{ kind: "connect-link", token }}
      size={72}
      aria-hidden
    />
  );

  if (owner.is_yours) {
    return (
      <Notice icon={picture}>
        <h1 className="text-2xl font-semibold">
          This is your own connect link
        </h1>
        <p className="text-muted-foreground">
          Whoever opens it can add you to their people.
        </p>
        <ButtonLink href={CONNECT_LINK_PANE_HREF} variant="outline">
          Open your connect link
        </ButtonLink>
      </Notice>
    );
  }

  if (personUuid) {
    return (
      <Notice icon={picture}>
        <h1 className="text-2xl font-semibold">
          {owner.name} is in your people
        </h1>
        <p className="text-muted-foreground">Connected to @{owner.username}.</p>
        <ButtonLink href={`/people/${personUuid}`} variant="outline">
          Go to {owner.name}
        </ButtonLink>
      </Notice>
    );
  }

  return (
    <>
      <Notice icon={picture}>
        <h1 className="text-2xl font-semibold">
          {owner.name} invited you to connect
        </h1>
        <p className="text-muted-foreground">@{owner.username}</p>
        <Button type="button" onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add to your people
        </Button>
      </Notice>
      <PersonDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        connecting={connecting}
        onSaved={(person) => setSaved(person.uuid)}
      />
    </>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      {icon}
      {children}
    </div>
  );
}
