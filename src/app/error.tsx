"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_COLUMN } from "@/components/ui/map-hero";

interface RouteErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// A render that throws anywhere below the root layout lands here, inside the app's
// chrome, instead of replacing the whole window with Next's own error screen. `retry`
// re-fetches and re-renders the segment, which is all a passing failure needs.
export default function RouteError({ error, retry }: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={PAGE_COLUMN}>
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-4">
          Something went wrong showing this page.
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retry}>
            <RotateCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
