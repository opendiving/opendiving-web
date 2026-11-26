import { z } from "zod";

import {
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  LINKS_MAX,
  type WebLink,
} from "@/lib/api/links";
import { isLinkUrl, normalizeLinkUrl } from "@/lib/links";
import { maxLengthMessage } from "./fields";

// A `type` rather than an interface, so it satisfies the list field's string record.
// Both strings, `""` being "not set"; `linksFromForm` is what turns a row into the
// API's shape.
export type LinkFormValue = { url: string; label: string };

export const emptyLink = (): LinkFormValue => ({ url: "", label: "" });

const LINK_URL_MESSAGE = "Use a web address, e.g. blueocean.com";

// A blank row is legal and dropped on save; a label beside a blank address is not,
// since what it names would be lost. The address is judged as it will be sent -
// trimmed, a bare host given its scheme.
const linkSchema = z
  .object({ url: z.string(), label: z.string() })
  .superRefine((row, context) => {
    const url = normalizeLinkUrl(row.url);
    if (url === null) {
      if (row.label.trim()) {
        context.addIssue({
          code: "custom",
          message: "Add the address, or clear the label",
          path: ["url"],
        });
      }
    } else if ([...url].length > LINK_URL_MAX) {
      context.addIssue({
        code: "custom",
        message: maxLengthMessage("Address", LINK_URL_MAX),
        path: ["url"],
      });
    } else if (!isLinkUrl(url, LINK_URL_MAX)) {
      context.addIssue({
        code: "custom",
        message: LINK_URL_MESSAGE,
        path: ["url"],
      });
    }
    if ([...row.label.trim()].length > LINK_LABEL_MAX) {
      context.addIssue({
        code: "custom",
        message: maxLengthMessage("Label", LINK_LABEL_MAX),
        path: ["label"],
      });
    }
  });

/** A record's links as its form holds them: rows, in the diver's order. */
export const linksField = () =>
  z.array(linkSchema).max(LINKS_MAX, `At most ${LINKS_MAX} links`);

/** A stored list as the form's rows hold it. */
export function linksToForm(
  links: readonly WebLink[] | undefined,
): LinkFormValue[] {
  return (links ?? []).map((link) => ({
    url: link.url,
    label: link.label ?? "",
  }));
}

/**
 * The form's rows as the API stores them: blank rows dropped, each address trimmed
 * and a bare host given `https://`, a blank label `null`, and an address named
 * twice kept where it first appears - the API folds it the same way, so the list
 * a dialog hands back is the one stored.
 */
export function linksFromForm(rows: readonly LinkFormValue[]): WebLink[] {
  const seen = new Set<string>();
  const links: WebLink[] = [];
  for (const row of rows) {
    const url = normalizeLinkUrl(row.url);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, label: row.label.trim() || null });
  }
  return links;
}
