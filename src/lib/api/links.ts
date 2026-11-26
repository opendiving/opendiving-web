/**
 * One of a record's links - a contact's, a person's, a course's, a gear item's or a
 * trip's: an absolute http(s) address to open, and what it is. Named for the web
 * because `Link` is `next/link`'s.
 */
export interface WebLink {
  url: string;
  // `null` or absent: the link is shown by its address.
  label?: string | null;
}

/**
 * The API's bounds on a record's links (`schemas/link.py`). The address and the
 * label are DiveJSON's; the list's cap is the API's own, what a two-box editor
 * can show.
 */
export const LINK_URL_MAX = 512;
export const LINK_LABEL_MAX = 120;
export const LINKS_MAX = 20;
