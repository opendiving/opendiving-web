"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  getGravatarUrl,
  getGravatarUrlStrict,
  getUserInitials,
} from "@/lib/utils";
import { User } from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";

interface UserAvatarProps {
  email: string;
  name: string;
  size?: number;
  className?: string;
}

export function UserAvatar({
  email,
  name,
  size = 80,
  className,
}: UserAvatarProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [hasCustomGravatar, setHasCustomGravatar] = React.useState(false);

  // Off unless the instance turned it on: this is the app's only third-party call
  // from the browser, and it hands Automattic a hash of the signed-in user's email
  // address along with their IP on every mount. `null` rather than an unused URL so
  // nothing downstream can reach for one - including the hash of the address.
  const { gravatarEnabled } = useConfig();
  const gravatarUrl = gravatarEnabled ? getGravatarUrl(email, size * 2) : null;
  const strictGravatarUrl = gravatarEnabled
    ? getGravatarUrlStrict(email, size)
    : null;
  const initials = getUserInitials(name);

  // Check if user has a custom Gravatar. Resets local state for the new email, then
  // subscribes to the browser's Image load/error events - the latter is an explicitly
  // sanctioned use of an effect ("subscribe to an external system"); the reset just
  // ensures stale state from a previous `email` isn't shown while that check runs.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageLoaded(false);
    setImageError(false);
    setHasCustomGravatar(false);

    if (!strictGravatarUrl) return;

    // Test if the user has a custom Gravatar by trying the 404 version
    const img = new Image();
    img.onload = () => {
      setHasCustomGravatar(true);
    };
    img.onerror = () => {
      setHasCustomGravatar(false);
    };
    img.src = strictGravatarUrl;
  }, [email, strictGravatarUrl]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoaded(false);
    setImageError(true);
  };

  return (
    <Avatar className={className} style={{ width: size, height: size }}>
      {hasCustomGravatar && gravatarUrl && (
        <AvatarImage
          src={gravatarUrl}
          alt={`${name}'s avatar`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
        {initials.length >= 2 ? initials : <User className="h-1/2 w-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
}
