"use client";

import { useCallback, type ReactNode } from "react";
import { FileText, ImageOff, Loader2 } from "lucide-react";
import {
  certificationsAPI,
  CertificationFileInfo,
  CertificationSide,
} from "@/lib/api/certifications";
import { useAuthedBlobUrl } from "@/hooks/useAuthedBlobUrl";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  CERTIFICATION_CARD_ASPECT_CLASS,
  certificationFileVersion,
} from "@/lib/certification";
import { cn } from "@/lib/utils";

interface CertificationCardFrameProps {
  /**
   * Draws the frame at the list view's thumbnail width instead of filling its
   * column. It changes the *width* only: the shape is the same everywhere, which
   * is the whole point of the frame existing.
   */
  compact?: boolean;
  /** Dashed, for a slot with nothing in it. */
  empty?: boolean;
  className?: string;
  /** Announces what the frame stands for when it holds no picture to describe. */
  "aria-label"?: string;
  title?: string;
  children?: ReactNode;
}

/**
 * The box a c-card is drawn in, wherever one is drawn: the standard card shape,
 * the app's own corner radius, and `overflow-hidden` so a picture filling it is
 * clipped to those corners rather than sitting square inside them.
 *
 * Exported because a card is not always a picture - a stored PDF, a slot the diver
 * has not filled, a fetch that failed and the check-in sheet's own PDF note all
 * occupy the same footprint, and a frame each of them re-declared is how the app
 * ended up drawing one card in four different shapes.
 */
export function CertificationCardFrame({
  compact = false,
  empty = false,
  className,
  children,
  ...rest
}: CertificationCardFrameProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg border bg-muted",
        CERTIFICATION_CARD_ASPECT_CLASS,
        compact ? "w-20" : "w-full",
        empty && "border-dashed",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

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

  if (!file) {
    // An empty slot is a normal state rather than a gap - most modern e-cards
    // are one-sided, so a card with nothing on the back is the common case. The
    // label names the side and the visible text does not, because the compact
    // list view renders this with no heading beside it to say which slot it is.
    return (
      <CertificationCardFrame
        compact={compact}
        empty
        className={className}
        aria-label={`No ${side} image uploaded`}
      >
        {!compact && (
          <span className="text-xs text-muted-foreground">Not uploaded</span>
        )}
      </CertificationCardFrame>
    );
  }

  if (isPdf) {
    return (
      <CertificationCardFrame
        compact={compact}
        className={cn("flex-col gap-1 text-muted-foreground", className)}
      >
        <FileText className={compact ? "h-4 w-4" : "h-6 w-6"} />
        {!compact && <span className="text-xs">PDF</span>}
      </CertificationCardFrame>
    );
  }

  if (isLoading) {
    return (
      <CertificationCardFrame compact={compact} className={className}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </CertificationCardFrame>
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
      <CertificationCardFrame
        compact={compact}
        className={cn("flex-col gap-1 px-2 text-muted-foreground", className)}
        title={message}
      >
        <ImageOff className={cn("shrink-0", compact ? "h-4 w-4" : "h-6 w-6")} />
        {!compact && (
          <span className="line-clamp-2 text-center text-xs">{message}</span>
        )}
      </CertificationCardFrame>
    );
  }

  return (
    <CertificationCardFrame compact={compact} className={className}>
      {/* Deliberately a plain `<img>` rather than `next/image`: the source is a
          runtime object URL for private bytes, which the image optimizer can
          neither fetch nor cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${side} of certification card`}
        // `cover`, not `contain`: a card cropped on upload fills this exactly, and
        // one stored before cropping existed loses a few percent of its edge
        // rather than sitting in a letterbox. Bars around a card are what made the
        // same picture look like a different size on every page it appeared on.
        className="h-full w-full object-cover"
      />
    </CertificationCardFrame>
  );
}
