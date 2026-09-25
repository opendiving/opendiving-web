// Display helpers for a contact, shared by the contacts page, the dialog and the
// cards that print one.

interface AddressParts {
  street?: string | null;
  city?: string | null;
  postcode?: string | null;
  region?: string | null;
  country?: string | null;
}

/**
 * An address on one line, its parts in the order a postal address is written and
 * the empty ones left out - `undefined` when nothing is left, so a caller drops
 * the element with `&&`. Takes the form's `""`-empty group as well as a stored
 * address, whose parts are `null` when unset.
 */
export function formatContactAddress(
  address: AddressParts | null | undefined,
): string | undefined {
  if (!address) return undefined;
  const parts = [
    address.street,
    address.city,
    address.postcode,
    address.region,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * A website as a link reads it: the host and path without the scheme or a
 * trailing slash, which is how a sign or a card prints one. The stored value is
 * always absolute (the API refuses anything else), so a failed parse only means
 * the text is shown as it is.
 */
export function formatWebsite(website: string): string {
  try {
    const url = new URL(website);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  } catch {
    return website;
  }
}

/**
 * The contacts a list of records names, each once, in the order the records first
 * name them - what a trip's "Dived with" line is made of, read off its dives in
 * the order the trip lists them. A record naming none contributes nothing.
 */
export function distinctContactUuids(
  records: readonly { contact_uuid?: string | null }[],
): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    if (record.contact_uuid) seen.add(record.contact_uuid);
  }
  return [...seen];
}
