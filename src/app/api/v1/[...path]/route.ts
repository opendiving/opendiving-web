import { proxyToApi } from "@/lib/api-proxy";

// The same-origin API proxy. All seven methods land on one handler; the logic lives in
// `lib/api-proxy.ts` because a route file may export only handlers and segment config.
//
// `force-dynamic` is belt and braces - route handlers already run per request - but a
// prerendered proxy would serve one caller's response to everyone, which is worth being
// explicit about next to a function that reads `process.env` and forwards cookies.
export const dynamic = "force-dynamic";

export const GET = proxyToApi;
export const HEAD = proxyToApi;
export const POST = proxyToApi;
export const PUT = proxyToApi;
export const PATCH = proxyToApi;
export const DELETE = proxyToApi;
export const OPTIONS = proxyToApi;
