"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { getUserInitials } from "@/lib/utils";
import { User } from "lucide-react";
import { authAPI } from "@/lib/api/auth";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";

interface UserAvatarProps {
  name: string;
  // The stored picture's digest (`User.avatar_sha256`), or null/undefined when there
  // is none. It is both "there is one" and which version it is - a replacement gives
  // the fetch a new URL, so the browser cannot serve the previous picture from its
  // own cache.
  avatarSha?: string | null;
  size?: number;
  className?: string;
}

/**
 * A diver's picture, falling back to their initials.
 *
 * The bytes are owner-only, so this cannot be an `<img src>` pointed at the API: the
 * access token lives in memory and an `<img>` cannot carry an `Authorization`
 * header. It fetches through the API client and renders from an object URL, the same
 * path certification card images take (`hooks/useAuthedBlobUrl.ts`).
 *
 * There is deliberately no loading state and no `onLoad`/`onError` bookkeeping: Radix
 * shows `AvatarFallback` until an `AvatarImage` has actually loaded, so an avatar in
 * flight, an avatar that failed and an account with no avatar all render the same
 * initials, with no layout shift between them and no broken-image glyph ever.
 */
export function UserAvatar({
  name,
  avatarSha,
  size = 80,
  className,
}: UserAvatarProps) {
  const initials = getUserInitials(name);

  // Stable per version so the hook refetches on a replacement and not on every
  // render. Null when there is no picture, which is what keeps an account without one
  // from making a request at all.
  const fetchBlob = React.useCallback(
    () => authAPI.getPictureBlob("avatar", avatarSha ?? undefined),
    [avatarSha],
  );

  const { url } = useAuthedBlobUrl(avatarSha ? fetchBlob : null);

  return (
    <Avatar className={className} style={{ width: size, height: size }}>
      {url && <AvatarImage src={url} alt={`${name}'s avatar`} />}
      <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
        {initials.length >= 2 ? initials : <User className="h-1/2 w-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
}
