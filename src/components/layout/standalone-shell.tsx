import Link from "next/link";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

interface StandaloneShellProps {
  children: React.ReactNode;
  // Merged onto the `<main>` column. In practice this is `text-center`, which the
  // status screens want and the three form pages don't.
  className?: string;
}

/**
 * The layout every route in `NO_CHROME_ROUTES` renders instead of `AppShell`: a
 * centered column on a full-height background, with the wordmark linking home as
 * the only way back out.
 *
 * It exists for the `<main>` element as much as for the six copies of the wordmark
 * it replaces. `AppShell` was the only place in the app that rendered one, so every
 * chrome-free page was a document with no main landmark and no landmark around any
 * of its content - two axe violations each (`landmark-one-main` and `region`).
 * Keeping the element here is what stops the seventh such page from reintroducing
 * them.
 */
export function StandaloneShell({ children, className }: StandaloneShellProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <main className={cn("w-full max-w-md", className)}>
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-foreground">
              OpenDiving
            </span>
          </Link>
        </div>

        {children}
      </main>
    </div>
  );
}
