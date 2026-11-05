import type { ExternalId } from "@/lib/api/dive-sites";

// The registries DiveJSON names, each with the identifier form its schema holds
// it to and the page that identifier opens. A registry outside them is carried as
// written and shown as text, since nothing says what its identifier looks like.
//
// A `Map`, not an object literal: the registry is any producer key the API took,
// and `constructor` is one, which an object would answer with its prototype's.
const REGISTRIES = new Map<
  string,
  { label: string; form: RegExp; href: (identifier: string) => string }
>([
  [
    "openstreetmap",
    {
      label: "OpenStreetMap",
      form: /^(node|way|relation)\/[1-9][0-9]*$/,
      href: (identifier) => `https://www.openstreetmap.org/${identifier}`,
    },
  ],
  [
    "wikidata",
    {
      label: "Wikidata",
      form: /^Q[1-9][0-9]*$/,
      href: (identifier) => `https://www.wikidata.org/wiki/${identifier}`,
    },
  ],
  [
    "worms",
    {
      label: "WoRMS",
      form: /^[1-9][0-9]*$/,
      href: (identifier) =>
        `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${identifier}`,
    },
  ],
]);

/** Two entries name the same registry record: registry and identifier, compared exactly. */
export function sameExternalId(first: ExternalId, second: ExternalId): boolean {
  return (
    first.registry === second.registry && first.identifier === second.identifier
  );
}

/** The registry as a reader knows it - `OpenStreetMap` - or as written where the format names no such registry. */
export function registryLabel(registry: string): string {
  return REGISTRIES.get(registry)?.label ?? registry;
}

/**
 * The registry's own page for the entry, or `null` for a registry the format does
 * not name, or an identifier not of its registry's form - a link built from one
 * would lead nowhere a reader could trust.
 */
export function externalIdHref(entry: ExternalId): string | null {
  const registry = REGISTRIES.get(entry.registry);
  if (!registry || !registry.form.test(entry.identifier)) return null;
  return registry.href(entry.identifier);
}
