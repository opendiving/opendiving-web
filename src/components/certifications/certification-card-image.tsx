"use client";

import { useCallback } from "react";
import { FileText, ImageOff, Loader2 } from "lucide-react";
import {
  certificationsAPI,
  CertificationFileInfo,
  CertificationSide,
} from "@/lib/api/certifications";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";
import { getApiErrorMessage } from "@/lib/api/error";
import { certificationFileVersion } from "@/lib/certification";
import { cn } from "@/lib/utils";

interface CertificationCardImageProps {
  certificationUuid: string;
  side: CertificationSide;
  // The embedded metadata for this side, or undefined if it has no file. Passing
  // it in (rather than probing the API) is what lets a list of cards render
  // without a request per empty slot.
  file?: CertificationFileInfo;
  className?: string;
  // Renders the "no image" state as a compact placeholder instead of a full
  // dashed panel, for the list view's small thumbnails.
  compact?: boolean;
}

// Renders one side of a stored certification card.
//
// Images are fetched with the API client and shown from an object URL, because
// the endpoint is owner-only and an `<img src>` cannot carry an `Authorization`
// header - see `hooks/useAuthedBlobUrl.ts`.
//
// PDFs are deliberately *not* previewed. Rendering one inline would mean an
// `<object>` or `<iframe>`, and the app's CSP sets `object-src 'none'` with a
// narrow `frame-src`; loosening either to display user-uploaded documents is a
// bad trade for a preview. They show as a labelled file instead, and the detail
// view offers a download. In practice this is the rare case - c-cards get
// photographed far more often than scanned.
export function CertificationCardImage({
  certificationUuid,
  side,
  file,
  className,
  compact = false,
}: CertificationCardImageProps) {
  const isPdf = file?.content_type === "application/pdf";

  // Identifies this version of the file - see `certificationFileVersion`. Without
  // it in the deps below, replacing a card image leaves the old one on screen.
  const version = certificationFileVersion(file);

  // Stable per file version so the hook doesn't refetch every render. Null when
  // there's nothing to fetch, which also covers the PDF case.
  const fetchBlob = useCallback(() => {
    return certificationsAPI.getCertificationFileBlob(
      certificationUuid,
      side,
      version ?? undefined,
    );
  }, [certificationUuid, side, version]);

  const { url, isLoading, hasError, error } = useAuthedBlobUrl(
    file && !isPdf ? fetchBlob : null,
  );

  const frame = cn(
    "flex items-center justify-center overflow-hidden rounded-md border bg-muted",
    compact ? "h-12 w-20" : "aspect-[85.6/53.98] w-full",
    className,
  );

  if (!file) {
    // An empty slot is a normal state rather than a gap - most modern e-cards
    // are one-sided, so a card with nothing on the back is the common case. The
    // label names the side and the visible text does not, because the compact
    // list view renders this with no heading beside it to say which slot it is.
    return (
      <div
        className={cn(frame, "border-dashed")}
        aria-label={`No ${side} image uploaded`}
      >
        {!compact && (
          <span className="text-xs text-muted-foreground">Not uploaded</span>
        )}
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className={cn(frame, "flex-col gap-1 text-muted-foreground")}>
        <FileText className={compact ? "h-4 w-4" : "h-6 w-6"} />
        {!compact && <span className="text-xs">PDF</span>}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={frame}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasError || !url) {
    // The API's own wording where it has one ("No front image for this
    // certification"), which is far more actionable than "couldn't load" - the
    // response interceptor unwraps the blob-wrapped error body so this reads as
    // a normal JSON error. Falls back for the network-failure case, which has no
    // body at all.
    const message = getApiErrorMessage(error, "Couldn't load image");
    return (
      <div
        className={cn(frame, "flex-col gap-1 px-2 text-muted-foreground")}
        title={message}
      >
        <ImageOff className={cn("shrink-0", compact ? "h-4 w-4" : "h-6 w-6")} />
        {!compact && (
          <span className="line-clamp-2 text-center text-xs">{message}</span>
        )}
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* Deliberately a plain `<img>` rather than `next/image`: the source is a
          runtime object URL for private bytes, which the image optimizer can
          neither fetch nor cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${side} of certification card`}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
