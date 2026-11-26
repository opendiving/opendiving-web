import { Globe } from "lucide-react";

import type { WebLink } from "@/lib/api/links";
import { linkText } from "@/lib/links";

// A record's links, each by its label or its address, opening in a new tab. A row
// apiece at touch height, so a short list of labels is still easy to hit.
export function LinkList({ links }: { links: readonly WebLink[] }) {
  return (
    <ul>
      {/* By position: a stored list is read as it is, duplicates and all. */}
      {links.map((link, index) => (
        <li key={index}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 text-sm hover:underline"
          >
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{linkText(link)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
