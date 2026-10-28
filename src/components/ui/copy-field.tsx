"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/**
 * A value to hand on - a link's address, an API key - read-only and selected on
 * focus, with a Copy button that reports in a toast. `label` names the field;
 * `what` names the value in the log; `copied` is the toast's title, and
 * `selectHint` what the failure toast tells the reader to do instead. Neither toast
 * carries the value itself. `mono` sets the value in the monospace face, for one
 * that is read character by character.
 */
export function CopyField({
  value,
  label,
  what,
  copied,
  selectHint,
  mono = false,
}: {
  value: string;
  label: string;
  what: string;
  copied: string;
  selectHint: string;
  mono?: boolean;
}) {
  const { toast } = useToast();

  // Nothing is awaited before the write: the clipboard needs the click's user
  // gesture still live, and an `await` ahead of it could spend it.
  const copy = () => {
    let written: Promise<void>;
    try {
      written = navigator.clipboard.writeText(value);
    } catch (error) {
      written = Promise.reject(error);
    }
    written.then(
      () => toast({ title: copied }),
      (error: unknown) => {
        // No clipboard on a page served over plain HTTP, which a LAN instance is.
        console.error(`Couldn't copy the ${what}:`, error);
        toast({
          title: "Couldn't copy",
          description: selectHint,
          variant: "destructive",
        });
      },
    );
  };

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        aria-label={label}
        className={mono ? "font-mono" : undefined}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button type="button" variant="outline" onClick={copy}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </Button>
    </div>
  );
}
