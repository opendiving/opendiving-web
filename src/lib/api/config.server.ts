import { connection } from "next/server";
import { resolveApiInternalUrl } from "@/lib/api-proxy";

import type { InstanceConfig } from "./config";

/**
 * The server-side twin of `configAPI.getInstanceConfig`, for pages that need this
 * instance's configuration before anything is sent to the browser.
 *
 * `lib/api/config.ts` reads `/config` through axios, whose base is relative and whose
 * caller is a browser. A Server Component has no origin to be relative to, so this one
 * dials the API container directly at `API_INTERNAL_URL` - the same address, resolved
 * the same way, as the proxy route the browser's call would have gone through.
 */

/**
 * Long enough for a container on the same private network, short enough that a page
 * cannot be held open by an API that accepted the connection and then went quiet. The
 * pages that call this must render whatever happens, so the deadline is part of the
 * contract rather than a tuning knob.
 */
const REQUEST_TIMEOUT_MS = 2_000;

/**
 * Whether the OpenDiving project itself operates this instance.
 *
 * `true` only where the API answered `project_operated: true`. Every other outcome -
 * `false`, an API too old to carry the field, a timeout, a connection refused, a
 * response that is not JSON - is `false`, and the asymmetry is the point: the copy that
 * gets the wrong answer in that direction is a project-run one that reads like any other
 * instance, which costs nothing. Wrong in the other direction is a self-hoster's privacy
 * policy naming a person who has never touched their machine.
 *
 * That is also what keeps a self-hosted copy whose API is down rendering its legal pages
 * unchanged rather than failing: there is no error path out of here, only `false`.
 *
 * Read per request, never memoised. `lib/runtime-config.ts` caches for the life of the
 * process because the environment cannot change under it; this value can, the moment the
 * operator restarts the API.
 */
export async function projectOperatesThisInstance(): Promise<boolean> {
  // Stops the prerender here. Under `cacheComponents` a build renders every route once,
  // and this fetch is rejected mid-prerender - caught below and read as "not
  // project-operated", which is the answer that would be baked in. The pages that call
  // this used to carry `dynamic = "force-dynamic"`, which the flag rejects.
  await connection();

  // An explicit controller rather than `AbortSignal.timeout`: this module is exercised
  // under jsdom, whose `AbortSignal` is not Node's, and a missing static would throw
  // before the fetch and be swallowed as "the API is down".
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveApiInternalUrl()}/api/v1/config`, {
      // Never a build-time or a cached read, for the reason `connection()` above gives:
      // the published image is built in CI with no API to ask, so anything prerendered
      // would bake in the failed answer for the life of the image.
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[instance-config] GET /config answered ${response.status}; ` +
          `reading this instance as not project-operated.`,
      );
      return false;
    }

    const config = (await response.json()) as Partial<InstanceConfig>;
    return config.project_operated === true;
  } catch (error: unknown) {
    console.warn(
      "[instance-config] Couldn't read this instance's configuration; " +
        "reading it as not project-operated.",
      error,
    );
    return false;
  } finally {
    clearTimeout(deadline);
  }
}
