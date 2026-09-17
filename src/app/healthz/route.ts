// The container healthcheck's endpoint, and nothing else's.
//
// Deliberately shallow: it answers if this process is serving HTTP, and says nothing
// about Postgres or Redis. Those belong to the API, which has its own readiness probe -
// a web container that failed its healthcheck because a database it never talks to was
// slow would be restarted for someone else's outage, and the app would still have been
// perfectly able to render its sign-in page.
//
// `connection()` because a route handler with no request-time API is prerendered at
// build and served from disk. That would still prove the process is up, but a health
// endpoint that answers without running any of the app's own code is a strange thing to
// trust, and the cost of running it is a string. `dynamic = "force-dynamic"` says the
// same thing and is rejected under `cacheComponents`.

import { connection } from "next/server";

export async function GET(): Promise<Response> {
  await connection();

  return new Response("ok\n", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // A cached "ok" is a healthcheck that passes after the app stops answering.
      "cache-control": "no-store",
    },
  });
}
