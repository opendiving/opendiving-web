"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/**
 * A link's address, read-only and selected on focus, with a Copy button that
 * reports in a toast. `label` names the field; `what` names the link in the log.
 */
export function LinkAddressField({
  url,
  label,
  what,
}: {
  url: string;
  label: string;
  what: string;
}) {
  const { toast } = useToast();

  // Nothing is awaited before the write: the clipboard needs the click's user
  // gesture still live, and an `await` ahead of it could spend it.
  const copy = () => {
    let written: Promise<void>;
    try {
      written = navigator.clipboard.writeText(url);
    } catch (error) {
      written = Promise.reject(error);
    }
    written.then(
      () => toast({ title: "Link copied" }),
      (error: unknown) => {
        // No clipboard on a page served over plain HTTP, which a LAN instance is.
        console.error(`Couldn't copy the ${what}:`, error);
        toast({
          title: "Couldn't copy",
          description: "Select the address and copy it from there.",
          variant: "destructive",
        });
      },
    );
  };

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={url}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button type="button" variant="outline" onClick={copy}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </Button>
    </div>
  );
}
