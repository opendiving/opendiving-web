import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PageHeaderProps {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
