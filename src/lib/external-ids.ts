import type { ExternalId } from "@/lib/api/dive-sites";

// The two registries DiveJSON names, each with the identifier form its schema holds
// it to and the page that identifier opens. A registry outside them is carried as
// written and shown as text, since nothing says what its identifier looks like.
const REGISTRIES: Record<
  string,
  { label: string; form: RegExp; href: (identifier: string) => string }
> = {
  openstreetmap: {
    label: "OpenStreetMap",
    form: /^(node|way|relation)\/[1-9][0-9]*$/,
    href: (identifier) => `https://www.openstreetmap.org/${identifier}`,
  },
  wikidata: {
    label: "Wikidata",
    form: /^Q[1-9][0-9]*$/,
    href: (identifier) => `https://www.wikidata.org/wiki/${identifier}`,
  },
};

/** Two entries name the same registry record: registry and identifier, compared exactly. */
export function sameExternalId(first: ExternalId, second: ExternalId): boolean {
  return (
    first.registry === second.registry && first.identifier === second.identifier
  );
}

/** The registry as a reader knows it - `OpenStreetMap` - or as written where the format names no such registry. */
export function registryLabel(registry: string): string {
  return REGISTRIES[registry]?.label ?? registry;
}

/**
 * The registry's own page for the entry, or `null` for a registry the format does
 * not name, or an identifier not of its registry's form - a link built from one
 * would lead nowhere a reader could trust.
 */
export function externalIdHref(entry: ExternalId): string | null {
  const registry = REGISTRIES[entry.registry];
  if (!registry || !registry.form.test(entry.identifier)) return null;
  return registry.href(entry.identifier);
}

/**
 * The site's entries after a catalogue pick, and the entry that pick added.
 *
 * A pick replaces the entry an earlier pick in the same dialog added - a diver who
 * picks the wrong row and then the right one keeps the right one's alone - and keeps
 * every entry the site carried when the dialog opened, which leaves only when the
 * diver removes it. A row whose entry is already there adds nothing, so `added` is
 * `null` and there is nothing for the next pick to replace.
 */
export function pickExternalId(
  current: readonly ExternalId[],
  earlierPick: ExternalId | null,
  picked: ExternalId,
): { externalIds: ExternalId[]; added: ExternalId | null } {
  const kept = earlierPick
    ? current.filter((entry) => !sameExternalId(entry, earlierPick))
    : [...current];
  if (kept.some((entry) => sameExternalId(entry, picked))) {
    return { externalIds: kept, added: null };
  }
  return { externalIds: [...kept, picked], added: picked };
}
