import { cn } from "@/lib/utils";

interface FormApiErrorProps {
  error: string | null;
  className?: string;
}

// The form-level refusal line - what came back after a submit, as opposed to the
// per-field validation `FormMessage` carries.
//
// Usually "the API said no", which is where it started and what every call site
// but one passes it. The dive form also hands it the browser's own reason for
// cancelling a submit (`lib/form-validity.ts`), which belongs here for the same
// reason: it arrives at the same moment, blocks the same action, and needs the
// same live region to be heard.
//
// Rendered unconditionally and `sr-only` until there is something to say, which is
// the whole point of the component existing: a live region that mounts *together
// with* its text is typically not announced at all, since screen readers register
// the region on insertion and read only *subsequent* changes. Ten call sites wrote
// this as a bare `{apiError && <p className="text-sm text-destructive">}`, so a
// refused save - a duplicate dive site, say - put its message on screen and said
// nothing, and the submit read to a screen-reader user as silently doing nothing.
//
// `sr-only` is `position: absolute`, so the empty region is out of flow and the
// spacing around the visible message is unchanged from that conditional markup.
//
// `role="alert"` rather than the `role="status"` used by the import note and the MOD
// warning: this one blocks what the diver was trying to do, and interrupting is
// warranted. It matches `StatusMessage`, which is the same choice for the same
// reason on the inline banners.
export function FormApiError({ error, className }: FormApiErrorProps) {
  return (
    <p
      role="alert"
      className={error ? cn("text-sm text-destructive", className) : "sr-only"}
    >
      {error}
    </p>
  );
}
