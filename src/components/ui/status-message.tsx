import { AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusMessageProps {
  variant: "error" | "success";
  children: React.ReactNode;
  className?: string;
}

// An inline outcome banner, for the places where a toast is the wrong shape.
//
// Most of the app reports outcomes through `useToast`, and should keep doing so. The
// exception is a form whose result the diver has to be able to *re-read* while
// fixing it - the sign-in form's "that link has expired", the email-change card's
// "check your new address" - where a message that fades after a few seconds is worse
// than one that stays put next to the field it is about.
//
// Five components each built this by hand from `red-600`/`green-600` pairs with
// per-theme overrides, against CONTRIBUTING.md's "use the Tailwind theme tokens".
// They are `destructive` and `success` now, so the two states are tuned once and
// keep the same weight as every other destructive surface in the app.
export function StatusMessage({
  variant,
  children,
  className,
}: StatusMessageProps) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle;

  return (
    <div
      // `role="alert"` so a screen reader announces the outcome without the diver
      // having to go looking for it - the whole reason this is inline rather than a
      // toast is that it is the answer to something they just did.
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm text-foreground",
        variant === "error"
          ? "border-destructive/40 bg-destructive/10"
          : "border-success/40 bg-success/10",
        className,
      )}
    >
      {/* The state is carried by the icon, the border and the tint - not by the
          body text, which stays `foreground`. `text-destructive` on
          `bg-destructive/10` is only 3.3:1 in light mode: `--destructive` is tuned
          as a button *background* under white, and reusing it as small body text
          over its own tint fails AA. This way the message is legible at ~17:1 and
          the colour still reads at a glance. */}
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          variant === "error" ? "text-destructive" : "text-success",
        )}
      />
      <span>{children}</span>
    </div>
  );
}
