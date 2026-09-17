import { proxyToApi } from "@/lib/api-proxy";

// The same-origin API proxy. All seven methods land on one handler; the logic lives in
// `lib/api-proxy.ts` because a route file may export only handlers and segment config.
//
// Nothing marks it dynamic: every handler reads the incoming request, which is
// request-time data on its own. `dynamic = "force-dynamic"` used to say so and is
// rejected under `cacheComponents`; the route table still prints it as dynamic.

export const GET = proxyToApi;
export const HEAD = proxyToApi;
export const POST = proxyToApi;
export const PUT = proxyToApi;
export const PATCH = proxyToApi;
export const DELETE = proxyToApi;
export const OPTIONS = proxyToApi;
