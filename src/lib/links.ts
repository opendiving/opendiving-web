import type { WebLink } from "@/lib/api/links";

/**
 * The whitespace DiveJSON §6.18 refuses anywhere in a link's address, by code
 * point: every character either ECMA-262's or Python's `\s` matches, which is the
 * API's `LINK_WHITESPACE`. `trim()` and `new URL()` let U+0085, U+001C-U+001F and
 * a space inside the path through, so the check reads the string itself.
 */
const LINK_WHITESPACE = new Set<number>([
  ...range(0x0009, 0x000e),
  ...range(0x001c, 0x0021),
  0x0085,
  0x00a0,
  0x1680,
  ...range(0x2000, 0x200b),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
  0xfeff,
]);

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, index) => start + index);
}

/**
 * A link's address as the API stores it: an absolute URL. A bare host - what a
 * diver copies off a sign - gets `https://` in front, since the API refuses one
 * without a scheme rather than guessing; anything already carrying `scheme://` is
 * left as typed, so an `ftp://` is refused beside the field instead of rewritten.
 * `null` for an empty box.
 */
export function normalizeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/**
 * Whether the API's `check_link_url` takes `url` as it stands: an http or https
 * address with a host, opening on its scheme, holding no whitespace, at most
 * `max` characters. The host is split as Python's `urlsplit` splits it, refusals
 * and all, so an address passing here is not refused there.
 */
export function isLinkUrl(url: string, max: number): boolean {
  const codePoints = [...url];
  if (codePoints.length > max) return false;
  if (codePoints.some((char) => LINK_WHITESPACE.has(char.codePointAt(0)!))) {
    return false;
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (!scheme || !["http", "https"].includes(scheme[1].toLowerCase())) {
    return false;
  }
  const rest = url.slice(scheme[0].length);
  if (!rest.startsWith("//")) return false;
  const netloc = rest.slice(2).split(/[/?#]/, 1)[0];
  return netloc !== "" && isSplittableNetloc(netloc);
}

// `urlsplit`'s own refusals of a host part, each a `ValueError` the API turns
// into a 422: unbalanced brackets, a bracketed host that is not IPv6 or
// IPvFuture, and a non-ASCII host that NFKC turns into a URL delimiter.
function isSplittableNetloc(netloc: string): boolean {
  const open = netloc.includes("[");
  const close = netloc.includes("]");
  if (open !== close) return false;
  if (open && !isBracketedNetloc(netloc)) return false;
  if (/^[\x00-\x7f]*$/.test(netloc)) return true;
  const bare = netloc.replace(/[@:#?]/g, "");
  const normalized = bare.normalize("NFKC");
  return normalized === bare || !/[/?#@:]/.test(normalized);
}

function isBracketedNetloc(netloc: string): boolean {
  const hostAndPort = netloc.slice(netloc.lastIndexOf("@") + 1);
  const bracket = hostAndPort.indexOf("[");
  let host: string;
  if (bracket >= 0) {
    if (bracket > 0) return false;
    const bracketed = hostAndPort.slice(1);
    const end = bracketed.indexOf("]");
    host = end >= 0 ? bracketed.slice(0, end) : bracketed;
    const port = end >= 0 ? bracketed.slice(end + 1) : "";
    if (port && !port.startsWith(":")) return false;
  } else {
    const colon = hostAndPort.indexOf(":");
    host = colon >= 0 ? hostAndPort.slice(0, colon) : hostAndPort;
  }
  if (/^[vV]/.test(host)) return /^[vV][a-fA-F0-9]+\..+$/s.test(host);
  return isIPv6(host);
}

// Python's `ipaddress.IPv6Address`, scope id included, since that is what
// `urlsplit` asks of a bracketed host.
function isIPv6(address: string): boolean {
  const percent = address.indexOf("%");
  if (percent >= 0) {
    const scope = address.slice(percent + 1);
    if (!scope || scope.includes("%")) return false;
    address = address.slice(0, percent);
  }
  const parts = address.split(":");
  if (parts.length < 3) return false;
  const last = parts[parts.length - 1];
  if (last.includes(".")) {
    if (!isIPv4(last)) return false;
    parts.splice(parts.length - 1, 1, "0", "0");
  }
  if (parts.length > 9) return false;
  let skip = -1;
  for (let index = 1; index < parts.length - 1; index++) {
    if (!parts[index]) {
      if (skip >= 0) return false;
      skip = index;
    }
  }
  let hextets: string[];
  if (skip >= 0) {
    let high = skip;
    let low = parts.length - skip - 1;
    if (!parts[0] && --high) return false;
    if (!parts[parts.length - 1] && --low) return false;
    if (8 - (high + low) < 1) return false;
    hextets = [...parts.slice(0, high), ...parts.slice(parts.length - low)];
  } else {
    if (parts.length !== 8 || !parts[0] || !parts[7]) return false;
    hextets = parts;
  }
  return hextets.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part));
}

function isIPv4(address: string): boolean {
  const octets = address.split(".");
  return (
    octets.length === 4 &&
    octets.every(
      (octet) =>
        /^[0-9]{1,3}$/.test(octet) &&
        Number(octet) <= 255 &&
        (octet === "0" || !octet.startsWith("0")),
    )
  );
}

/**
 * An address as a link reads it: the host and path without the scheme or a
 * trailing slash, which is how a sign or a card prints one. A stored address is
 * absolute (the API refuses anything else), so a failed parse only means the text
 * is shown as it is.
 */
export function formatLinkAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** What a link shows: its label, or its address without the scheme. */
export function linkText(link: WebLink): string {
  return link.label?.trim() || formatLinkAddress(link.url);
}
