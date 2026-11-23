"use client";

import { UserAvatar, type PictureSource } from "@/components/ui/user-avatar";

/**
 * The account a person is being connected to, as the read that opened the form
 * had it: through a live connect link, or from a row under Added you.
 */
export type ConnectTarget =
  | {
      via: "link";
      token: string;
      name: string;
      username: string;
      avatarSha: string | null;
    }
  | {
      via: "account";
      uuid: string;
      name: string;
      username: string;
      avatarSha: string | null;
    };

export function connectTargetSource(target: ConnectTarget): PictureSource {
  return target.via === "link"
    ? { kind: "connect-link", token: target.token }
    : { kind: "added-you", uuid: target.uuid };
}

interface ConnectedAccountHeadProps {
  source: PictureSource;
  avatarSha: string | null | undefined;
  username: string;
  // The account's own name, where a connection is being made. A person already
  // connected carries the diver's name for them and not the account's, so it
  // has none to show.
  accountName?: string;
  // Whose initials stand in for a missing picture.
  fallbackName: string;
}

// The read-only head of the person form: whose account this person is, or is
// about to be, connected to.
export function ConnectedAccountHead({
  source,
  avatarSha,
  username,
  accountName,
  fallbackName,
}: ConnectedAccountHeadProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <UserAvatar
        name={accountName ?? fallbackName}
        avatarSha={avatarSha}
        source={source}
        size={48}
        aria-hidden
      />
      <div className="min-w-0">
        {accountName && <p className="truncate font-medium">{accountName}</p>}
        <p className="truncate text-sm text-muted-foreground">@{username}</p>
      </div>
    </div>
  );
}
