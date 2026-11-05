import type { ComponentType } from "react";
import Link from "next/link";

export interface AdminScreenCardProps {
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}

/** One screen of the admin section, as `/admin` offers it. */
export function AdminScreenCard({
  href,
  icon: Icon,
  title,
  description,
}: AdminScreenCardProps) {
  return (
    <Link
      href={href}
      className="flex h-full gap-3 rounded-lg border bg-card p-4 max-sm:p-3 transition-colors hover:bg-muted/50"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}
