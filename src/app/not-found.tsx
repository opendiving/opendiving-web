import { NotFoundState } from "@/components/ui/not-found-state";
import { PAGE_COLUMN } from "@/components/ui/map-hero";

// Every URL no route matches, and every `notFound()`. It renders inside the root
// layout, so it keeps the app's chrome and follows the diver's theme rather than only
// the OS colour scheme, and an address that exists reads the same as one that doesn't.
// `/` serves both a visitor and a signed-in diver, whom the landing page sends on to
// `/home`.
export default function NotFound() {
  return (
    <div className={PAGE_COLUMN}>
      <NotFoundState
        message="Page not found."
        backHref="/"
        backLabel="Back to home"
      />
    </div>
  );
}
