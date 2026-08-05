import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import MD5 from "crypto-js/md5";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate MD5 hash of email for Gravatar
 */
function md5(input: string): string {
  return MD5(input).toString();
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
  const hash = md5(cleanEmail);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}&r=${rating}`;
}

/**
 * Get Gravatar URL that returns 404 if no custom avatar exists
 */
export function getGravatarUrlStrict(email: string, size: number = 80): string {
  const cleanEmail = email.trim().toLowerCase();
  const hash = md5(cleanEmail);
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
