"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  getGravatarUrl,
  getGravatarUrlStrict,
  getUserInitials,
} from "@/lib/utils";
import { User } from "lucide-react";

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

  const gravatarUrl = getGravatarUrl(email, size);
  const strictGravatarUrl = getGravatarUrlStrict(email, size);
  const initials = getUserInitials(name);

  // Check if user has a custom Gravatar
  React.useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setHasCustomGravatar(false);

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
      {hasCustomGravatar && (
        <AvatarImage
          src={gravatarUrl}
          alt={`${name}'s avatar`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
      <AvatarFallback className="bg-blue-100 text-blue-600 font-medium text-sm">
        {initials.length >= 2 ? initials : <User className="h-1/2 w-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
}
