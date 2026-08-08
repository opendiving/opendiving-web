import { Loader2 } from "lucide-react";

// A full-viewport centered spinner, used as a loading placeholder while
// auth/route data is still resolving (e.g. behind a `Suspense` boundary, or
// while `useAuthGuard()` is still loading).
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
