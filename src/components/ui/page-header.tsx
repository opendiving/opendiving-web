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
   * opposite the back link on its own row, which is the row already holding
   * this page's other way out.
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
      <div className="flex items-center justify-between gap-2 mb-2">
        <Button variant="ghost" size="sm" asChild className="px-0">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Link>
        </Button>
        {nav}
      </div>
      {/* Stacked below `sm`, side by side above it. As one `justify-between` row
          at every width, the title block got about 150px on a 375px screen with
          Edit and Delete beside it - enough to wrap the dive page's date line
          over five lines. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
