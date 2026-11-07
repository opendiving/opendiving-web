"use client";

import { useId } from "react";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { isPublic: false, label: "Private", hint: "This site stays yours alone." },
  {
    isPublic: true,
    label: "Public",
    hint: "Proposes this site to OpenDiving Commons, for everyone to use once a reviewer accepts it.",
  },
];

interface SiteVisibilityFieldProps {
  isPublic: boolean;
  // Locks the choice on Public. Public is what a site with a waiting proposal
  // reads as, and nothing about it is stored on the site.
  isWaiting: boolean;
  onChange: (isPublic: boolean) => void;
}

// Private or public, in the form for a diver's own site. Mounted with the open
// dialog, so the config is asked for when a form opens rather than on every page
// the header's form is hosted on. Native radios, for the reasons `RatingInput` gives.
export function SiteVisibilityField({
  isPublic,
  isWaiting,
  onChange,
}: SiteVisibilityFieldProps) {
  const { config } = useInstanceConfig();
  const name = useId();
  const labelId = useId();
  const lockedId = useId();
  if (config?.commons_primary !== true) return null;

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-medium">
        Visibility
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={isWaiting ? lockedId : undefined}
        className="space-y-2"
      >
        {OPTIONS.map((option) => (
          <label
            key={option.label}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 text-sm",
              isWaiting ? "cursor-not-allowed opacity-70" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={(isPublic || isWaiting) === option.isPublic}
              disabled={isWaiting}
              onChange={() => onChange(option.isPublic)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {isWaiting && (
        <p id={lockedId} className="text-sm text-muted-foreground">
          This site is waiting for review. Withdraw on the site&rsquo;s page is
          the way back to private.
        </p>
      )}
    </div>
  );
}
