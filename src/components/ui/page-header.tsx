import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PageHeaderProps {
  backHref: string;
  backLabel: string;
  /**
   * Usually a plain string. A node so `DetailPageSkeleton` can put a
   * `Skeleton` bar here while the record loads, which is what keeps the header
   * the same height before and after it lands.
   */
  title: ReactNode;
  /**
   * Usually a plain string. A node for the same reason `title` is one - it
   * stands in for a `Skeleton` bar during the load. The `<p>` below styles the
   * line either way, so anything richer must stay phrasing content.
   */
  subtitle?: ReactNode;
  /**
   * Navigation *between records*, as opposed to the `actions` that operate on
   * the one being shown - currently the dive page's previous/next pager. Sits
   * on the title's own line, at the opposite end of that row from `actions`:
   * it is about the record named beside it, and the width between the two
   * keeps a step away from the destructive button.
   */
  nav?: ReactNode;
  /** Optional right-aligned actions (e.g. Edit/Delete buttons on detail pages). */
  actions?: ReactNode;
}

// The "back" button + title/subtitle block shared across detail and form
// pages, optionally paired with right-aligned actions.
export function PageHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  nav,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6">
      <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backLabel}
        </Link>
      </Button>
      {/* Stacked below `sm`, side by side above it. As one `justify-between` row
          at every width, the title block got about 150px on a 375px screen with
          Edit and Delete beside it - enough to wrap the dive page's date line
          over five lines. `items-start` rather than `items-center` so `actions`
          sits on the title's line and not on the midpoint between the title and
          the subtitle, which is where `nav` now is. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {/* `nav` shares the title's line, and `h-9` on its controls is exactly
              the `text-3xl` line box, so the two sit level without either being
              nudged. Wraps below the title on a narrow screen rather than
              squeezing it. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-bold">{title}</h1>
            {nav}
          </div>
          {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </div>
  );
}
