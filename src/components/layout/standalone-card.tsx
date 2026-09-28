import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The card a chrome-free page (`StandaloneShell`) draws its content in, and the block
// it opens with: an icon on the card itself, a small heading, a line under it.
// `/signin` set the look, and every page a diver meets on the way in or out - the
// email sent, the profile to finish, a link being checked, an account deleted - is
// one of these, so the flow reads as one object changing its contents. Padded as
// `Card` is, narrower on a phone.
export function StandaloneCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border bg-card p-6 shadow-sm max-sm:px-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface StandaloneCardHeaderProps {
  icon: LucideIcon;
  /** `text-primary` unless the state has a colour of its own. */
  iconClassName?: string;
  title?: ReactNode;
  /**
   * `h1` on a page of its own. `AuthForm` and `CheckEmailCard` pass `h3` under the
   * landing page's hero, which already has the page's `h1`, and `h2` where the card
   * carries a heading of its own there; only the tag changes.
   */
  titleAs?: "h1" | "h2" | "h3";
  description?: ReactNode;
}

// `not-last:mb-6` so a status screen that is only this block does not end in a gap
// the card's own padding already provides.
export function StandaloneCardHeader({
  icon: Icon,
  iconClassName,
  title,
  titleAs: Title = "h1",
  description,
}: StandaloneCardHeaderProps) {
  return (
    <div className="text-center not-last:mb-6">
      <Icon
        aria-hidden
        className={cn("mx-auto mb-3 h-10 w-10 text-primary", iconClassName)}
      />
      {title && (
        <Title className="text-lg font-semibold text-foreground">{title}</Title>
      )}
      {description && (
        <p className={cn("text-sm text-muted-foreground", title && "mt-1")}>
          {description}
        </p>
      )}
    </div>
  );
}
