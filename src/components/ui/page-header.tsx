import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PageHeaderProps {
  backHref: string;
  backLabel: string;
  /**
   * Usually a plain string. A node so `FormPageSkeleton` can put a
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
   * Right-aligned on the back link's row - on detail pages, Edit and the
   * `ItemActionsMenu` holding everything else.
   */
  actions?: ReactNode;
}

// The way back from a detail or form page, on its own for a page whose heading
// is drawn elsewhere - a detail page's, over its hero.
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Button variant="ghost" size="sm" asChild className={cn("px-0", className)}>
      <Link href={href}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {label}
      </Link>
    </Button>
  );
}

// The "back" button + title/subtitle block shared across detail and form
// pages, optionally with actions opposite the back button.
export function PageHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6">
      {/* `min-h-10` is the actions' height, so the title sits at one offset
          whether or not a page has any. `mb-6` rather than the page's `pt-8`
          above: the title's line box carries its own ~6px of space over the
          capitals, and it is the visible gaps either side of the row that
          match. */}
      <div className="mb-6 flex min-h-10 items-center justify-between gap-4">
        <BackLink href={backHref} label={backLabel} />
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      <h1 className="text-3xl font-bold">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
