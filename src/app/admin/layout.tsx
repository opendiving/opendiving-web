"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PageSpinner } from "@/components/ui/page-spinner";

/**
 * The gate on the whole admin section, and the second layout below the root
 * (after `dives/(detail)/`).
 *
 * Three states, in the order every protected page in this app takes them: a
 * spinner while the auth bootstrap is still deciding, nothing at all while
 * `useAuthGuard` bounces a signed-out visitor to `/signin?next=...`, and - the
 * one thing new here - the app's ordinary not-found state for a signed-in diver
 * who is not a superuser. Not a "forbidden" page: a diver who guesses the URL
 * learns nothing about whether the section exists, which is the same answer a
 * dive or course uuid that is not theirs already gets.
 *
 * **This gate is a convenience, never the protection.** Every `/admin/*` route
 * on the API carries a superuser dependency of its own and refuses whatever page
 * called it, so the worst an edited `is_superuser` buys is an empty table and a
 * toast.
 *
 * The ordinary `AppShell` chrome stays: it is the same person, on the same site,
 * and `/admin` is deliberately absent from `NO_CHROME_ROUTES`.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading } = useAuthGuard();

  if (isLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (!user?.is_superuser) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Page not found."
          backHref="/dashboard"
          backLabel="Back to Dashboard"
        />
      </div>
    );
  }

  return <>{children}</>;
}
