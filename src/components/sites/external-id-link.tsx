import { ExternalLink } from "lucide-react";
import type { ExternalId } from "@/lib/api/dive-sites";
import { externalIdHref, registryLabel } from "@/lib/external-ids";

// One registry entry as a reader meets it: the registry's name and the
// identifier, linking to the registry's own page where the format names the
// registry, and plain text where it does not.
export function ExternalIdLink({ entry }: { entry: ExternalId }) {
  const href = externalIdHref(entry);
  const text = (
    <>
      {registryLabel(entry.registry)}{" "}
      <span className="break-all tabular-nums">{entry.identifier}</span>
    </>
  );
  if (!href) return <span>{text}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 underline hover:text-foreground"
    >
      <span>{text}</span>
      <ExternalLink aria-hidden className="h-3 w-3 shrink-0 self-center" />
    </a>
  );
}
