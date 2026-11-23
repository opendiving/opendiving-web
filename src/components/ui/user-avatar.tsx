"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { getUserInitials } from "@/lib/utils";
import { User } from "lucide-react";
import { authAPI } from "@/lib/api/auth";
import { connectLinksAPI } from "@/lib/api/connect-links";
import { peopleAPI } from "@/lib/api/people";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";

/**
 * Whose picture to read, and by which route. The session's own by default; another
 * account's only by a route that answers while the diver may see it - through a
 * person connected to it, a row under Added you, or a live connect link, whose
 * token is the credential and which therefore works signed out.
 */
export type PictureSource =
  | { kind: "own" }
  | { kind: "person"; uuid: string }
  | { kind: "added-you"; uuid: string }
  | { kind: "connect-link"; token: string };

const OWN: PictureSource = { kind: "own" };

// A source as two strings, so the fetch below is remade only when what it names
// changes and not whenever a caller rebuilds the object.
function sourceParts(source: PictureSource): [PictureSource["kind"], string] {
  switch (source.kind) {
    case "own":
      return ["own", ""];
    case "person":
    case "added-you":
      return [source.kind, source.uuid];
    case "connect-link":
      return ["connect-link", source.token];
  }
}

function readPicture(
  kind: PictureSource["kind"],
  id: string,
  version: string | undefined,
): Promise<Blob> {
  switch (kind) {
    case "own":
      return authAPI.getPictureBlob("avatar", version);
    case "person":
      return peopleAPI.getPersonPictureBlob(id, version);
    case "added-you":
      return peopleAPI.getAddedYouPictureBlob(id, version);
    case "connect-link":
      return connectLinksAPI.getOwnerPictureBlob(id, version);
  }
}

interface UserAvatarProps {
  name: string;
  // The stored picture's digest (`User.avatar_sha256`), or null/undefined when there
  // is none. It is both "there is one" and which version it is - a replacement gives
  // the fetch a new URL, so the browser cannot serve the previous picture from its
  // own cache.
  avatarSha?: string | null;
  // Whose picture it is. The session's own when unset.
  source?: PictureSource;
  // What shows without a picture: the name's initials, or the plain person icon a
  // person who is not connected shows, so that a connected one whose account has
  // no picture looks like any other.
  fallback?: "initials" | "icon";
  // In pixels, the initials scaled to match. Unset, `className` sizes the circle
  // and the initials both.
  size?: number;
  className?: string;
  // For a picture beside the name it would only repeat.
  "aria-hidden"?: React.AriaAttributes["aria-hidden"];
}

/**
 * A diver's picture, falling back to their initials or the plain person icon.
 *
 * The bytes are private - the owner's, or another account's to a diver tied to it -
 * so this cannot be an `<img src>` pointed at the API: the access token lives in
 * memory and an `<img>` cannot carry an `Authorization` header. It fetches through the API client and renders from an object URL, the same
 * path certification card images take (`hooks/useAuthedBlobUrl.ts`).
 *
 * There is deliberately no loading state and no `onLoad`/`onError` bookkeeping: Base UI
 * shows `AvatarFallback` until an `AvatarImage` has actually loaded, so an avatar in
 * flight, an avatar that failed and an account with no avatar all render the same
 * initials, with no layout shift between them and no broken-image glyph ever.
 */
export function UserAvatar({
  name,
  avatarSha,
  source = OWN,
  fallback = "initials",
  size,
  className,
  "aria-hidden": ariaHidden,
}: UserAvatarProps) {
  const initials = getUserInitials(name);

  // Stable per version so the hook refetches on a replacement and not on every
  // render. Null when there is no picture, which is what keeps an account without one
  // from making a request at all.
  const [kind, id] = sourceParts(source);
  const fetchBlob = React.useCallback(
    () => readPicture(kind, id, avatarSha ?? undefined),
    [kind, id, avatarSha],
  );

  const { url } = useAuthedBlobUrl(avatarSha ? fetchBlob : null);

  return (
    <Avatar
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden={ariaHidden}
    >
      {url && <AvatarImage src={url} alt={`${name}'s avatar`} />}
      {fallback === "icon" ? (
        // The icon a person row draws, filling the circle's box, so a picture in
        // flight and no picture at all are the same row.
        <AvatarFallback className="bg-transparent text-muted-foreground">
          <User className="h-full w-full" />
        </AvatarFallback>
      ) : (
        // The initials scale with the circle: `text-sm` at the header's 36px.
        <AvatarFallback
          className="bg-primary/10 text-primary font-medium"
          style={size ? { fontSize: size * 0.4 } : undefined}
        >
          {initials || <User className="h-1/2 w-1/2" />}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
