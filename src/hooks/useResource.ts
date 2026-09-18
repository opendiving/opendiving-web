"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";

interface UseResourceOptions<T> {
  /** Hold off fetching until this is true (typically until `user` is known). */
  enabled?: boolean;
  /** Toast shown, and logged, when the fetch fails. */
  errorMessage: string;
  /** Where the diver is sent when the fetch fails - the resource's list page. */
  redirectTo: string;
  /**
   * Runs with each freshly loaded resource. For callers that seed something from
   * it, like the dive edit page's `form.reset`. Held in a ref, so an inline arrow
   * function - the obvious thing to write - doesn't restart the fetch.
   */
  onLoaded?: (resource: T) => void;
}

/**
 * Fetch-one-resource-by-route-param, for the `[id]` detail pages.
 *
 * The detail pages and the dive edit page each hand-rolled the same block: read
 * `params.id`, cast it to a string, fetch, toast-and-redirect on failure, clear a
 * loading flag in `finally`. They had drifted in the usual small ways - some
 * guarded against settling after unmount and some didn't, so navigating away from
 * a slow dive page still fired a toast and a redirect on whatever page the diver
 * had landed on.
 *
 * `params.id as string` lives here now too. The cast is unavoidable (Next types the
 * param as `string | string[]`, and only a catch-all route can produce the array),
 * but it is worth making once rather than in every page that reads an `[id]`.
 */
export function useResource<T>(
  fetchFn: (id: string) => Promise<T>,
  { enabled = true, errorMessage, redirectTo, onLoaded }: UseResourceOptions<T>,
) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [resource, setResource] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A `[id]` route always yields a single segment; the array case belongs to
  // catch-all routes, which none of these are.
  const id = params.id as string;

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  // Re-reads the resource *without* touching `isLoading`, so a refresh swaps the card
  // that changed instead of blanking the page into a spinner. A failure here is
  // non-fatal - whatever prompted the refresh already succeeded - so it doesn't
  // redirect.
  //
  // `seed` is what separates the two callers. A refresh the page asked for after its
  // own edit wants `onLoaded` to run, so a form follows the record; a re-read on the
  // way back to a kept-mounted route does not, because the diver may have typed into
  // that form since and re-seeding would discard it.
  const reread = useCallback(
    async (seed: boolean) => {
      if (!id) return;
      try {
        const data = await fetchFn(id);
        setResource(data);
        if (seed) onLoadedRef.current?.(data);
      } catch (error) {
        console.error(errorMessage, error);
      }
    },
    [id, fetchFn, errorMessage],
  );

  const refetch = useCallback(() => reread(true), [reread]);

  // What the effect below last *finished* loading. A route the diver has left is kept
  // mounted, and its effects are destroyed on hide and re-created on show - so without
  // this the return would set `isLoading` again, swapping the dive edit form back to
  // its skeleton and re-seeding it from the server over whatever was typed.
  //
  // Recorded when the load settles rather than when it starts, which is the difference
  // from `useEffectOnChange`: the cleanup below abandons an in-flight request, so a
  // hide part-way through has to leave the work owed rather than marking it done.
  const loadedFor = useRef<readonly unknown[] | null>(null);

  useEffect(() => {
    if (!enabled || !id) return;
    const key = [id, fetchFn] as const;
    if (
      loadedFor.current &&
      loadedFor.current[0] === key[0] &&
      loadedFor.current[1] === key[1]
    ) {
      // A return to a route that was kept mounted, where the page is already drawn.
      // Re-read rather than skip: an edit saved from `/dives/[id]/edit` pushes back
      // here, and a page that only trusted what it was holding would show the dive as
      // it was before the save. Quietly, though - no `isLoading`, so the record does
      // not blank into its skeleton, and no re-seed, so a form keeps what was typed.
      void reread(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const data = await fetchFn(id);
        if (cancelled) return;
        loadedFor.current = key;
        setResource(data);
        onLoadedRef.current?.(data);
      } catch (error) {
        console.error(errorMessage, error);
        // The guard matters most here: without it a request that outlives the page
        // toasts and redirects on top of wherever the diver went next.
        if (cancelled) return;
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        router.push(redirectTo);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, id, fetchFn, errorMessage, redirectTo, toast, router, reread]);

  return { id, resource, setResource, isLoading, refetch };
}
