"use client";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { Person } from "@/lib/api/people";
import { cn } from "@/lib/utils";

interface PersonPictureProps {
  person: Pick<Person, "uuid" | "name" | "avatar_sha256">;
  className?: string;
}

// A person's mark wherever a person is read: the connected account's picture, or
// the plain person icon - for a person who is not connected, and alike for one
// whose account has no picture, so the two look the same. Decorative: the name
// beside it says who it is.
export function PersonPicture({ person, className }: PersonPictureProps) {
  return (
    <UserAvatar
      name={person.name}
      avatarSha={person.avatar_sha256}
      source={{ kind: "person", uuid: person.uuid }}
      fallback="icon"
      aria-hidden
      className={cn("size-5", className)}
    />
  );
}
