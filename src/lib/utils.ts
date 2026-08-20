import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import SHA256 from "crypto-js/sha256";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Hash an email address for Gravatar.
 *
 * SHA-256, not MD5. Gravatar has accepted both at the same `/avatar/{hash}`
 * endpoint since 2022 and documents SHA-256 as the preferred one; it is also
 * the form its own profile API hands back as an account's canonical hash. This
 * buys no confidentiality - an email address has far too little entropy for a
 * digest of it to be anything but an identifier, whichever algorithm computes
 * it, which is why `GRAVATAR_ENABLED` defaults to off and the privacy page
 * spells out what is disclosed. The point is only not to be reaching for MD5.
 */
function hashEmail(input: string): string {
  return SHA256(input).toString();
}

/**
 * Get Gravatar URL for an email address
 * @param email - User's email address
 * @param size - Avatar size (default: 80px)
 * @param defaultImage - Default image type (default: 'identicon')
 * @param rating - Content rating (default: 'g' for general)
 */
export function getGravatarUrl(
  email: string,
  size: number = 80,
  defaultImage: string = "mp",
  rating: string = "g",
): string {
  const cleanEmail = email.trim().toLowerCase();
  const hash = hashEmail(cleanEmail);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}&r=${rating}`;
}

/**
 * Get Gravatar URL that returns 404 if no custom avatar exists
 */
export function getGravatarUrlStrict(email: string, size: number = 80): string {
  const cleanEmail = email.trim().toLowerCase();
  const hash = hashEmail(cleanEmail);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/**
 * Get user initials from name for fallback avatar
 */
export function getUserInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Check if an image URL loads successfully
 */
export function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
