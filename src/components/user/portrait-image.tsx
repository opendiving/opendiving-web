"use client";

import { useCallback, type HTMLAttributes } from "react";

import { authAPI } from "@/lib/api/auth";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";
import { cn } from "@/lib/utils";

interface PortraitFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Dashed, for a place where a portrait could be and is not. */
  empty?: boolean;
}

/**
 * The one box a portrait is drawn in: 7:9, the proportion of a 35 x 45 mm passport
 * photo, which is the shape the API renders it to. Its width is the caller's.
 *
 * `self-start` for the reason `CertificationCardFrame` has it: `aspect-ratio` applies
 * only to a box whose height is auto, and a flex item stretches to its line.
 */
export function PortraitFrame({
  empty = false,
  className,
  children,
  ...rest
}: PortraitFrameProps) {
  return (
    <div
      className={cn(
        "relative flex aspect-[7/9] items-center justify-center self-start overflow-hidden rounded-md border bg-muted",
        empty && "border-dashed",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The diver's stored portrait, fetched through the API client as `UserAvatar` fetches
 * the avatar - the bytes are owner-only on this route. The one `<img src>` a portrait
 * has is a check-in link's, where the token in the path is the credential and the
 * check-in frame draws it itself. No fallback inside the frame: initials identify
 * nobody, and this picture exists to identify somebody.
 */
export function PortraitImage({
  name,
  portraitSha,
  className,
}: {
  name: string;
  /** `User.portrait_sha256`: whether there is one, and which version. */
  portraitSha?: string | null;
  className?: string;
}) {
  const fetchBlob = useCallback(
    () => authAPI.getPictureBlob("portrait", portraitSha ?? undefined),
    [portraitSha],
  );
  const { url } = useAuthedBlobUrl(portraitSha ? fetchBlob : null);

  return (
    <PortraitFrame className={className}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Portrait of ${name}`}
          // Already 7:9, so this crops nothing.
          className="h-full w-full object-cover"
        />
      )}
    </PortraitFrame>
  );
}
