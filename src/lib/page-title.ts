// Every tab reads "<page> – OpenDiving", or "<page> – <section> – OpenDiving" for a page
// inside a section - "#44 El Puertito – Dives – OpenDiving". The root layout's
// `title.template` wraps a page's `metadata`, and `useDocumentTitle` a name only the
// browser learns.
export const PAGE_TITLE_TEMPLATE = "%s – OpenDiving";

// A replacer function, since a replacement string expands `$&`, `$'` and `$$` - and
// the name is whatever the diver called their trip.
export const pageTitle = (name: string, section?: string) =>
  PAGE_TITLE_TEMPLATE.replace("%s", () =>
    section ? `${name} – ${section}` : name,
  );
