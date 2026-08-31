import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { API_BASE_URL } from "@/lib/api-base";

/**
 * Dispatched when a token refresh fails so `AuthContext` can clear the stale
 * user; existing per-page "redirect to the landing page when unauthenticated"
 * guards then handle navigation via Next's router instead of a hard page reload.
 */
export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";

// The full base every request is appended to, `/api/v1` prefix included - the API
// mounts nothing at the bare origin, so a value without it 404s on every call.
//
// Unset, this is the *relative* `/api/v1`, served by this app's own proxy route and
// resolved by the browser against whatever origin loaded the page. `NEXT_PUBLIC_API_URL`
// overrides it at build time for a split-origin deployment, and local dev sets it in
// `.env` so the browser keeps talking to `localhost:8000` directly.
//
// Declared in `lib/api-base.ts` rather than here because axios is no longer its only
// consumer: a species photo is an unauthenticated `<img src>` that never goes through
// this client and still has to resolve to the same base. Two copies of the `||` would be
// two places for the split-origin build to break.

// The access token is intentionally kept in memory only, never in
// localStorage/sessionStorage: those are readable by any JS running on the
// page (XSS payloads, compromised third-party scripts, browser extensions,
// error-reporting SDKs that serialize storage, ...), so keeping the token
// out of them shrinks the exfiltration surface even though it can't fully
// defend against a live XSS payload calling the API directly. Being
// in-memory-only means it doesn't survive a hard reload/new tab; those
// re-derive it from the httpOnly refresh cookie via `refreshAccessToken`
// (see `AuthContext`'s bootstrap effect).
let accessToken: string | null = null;

// De-duplicates concurrent, identical in-flight GET requests so callers
// (e.g. two components independently fetching the same data, or React
// Strict Mode's double-invoked effects in development) share a single
// network request/response instead of each firing their own. Safe for GETs
// since they're idempotent; mutating verbs (POST/PATCH/DELETE) intentionally
// aren't touched here. Declared up here rather than beside the `apiClient.get`
// override below because `clearAccessToken` has to flush it.
const pendingGetRequests = new Map<string, Promise<AxiosResponse>>();

/**
 * The current access token, or null when signed out.
 *
 * Deliberately in memory rather than `localStorage`: only the *refresh* token is a
 * cookie, so a token read out of storage by injected script is not a risk that exists
 * here. The trade is that a full page reload starts signed-out until the refresh
 * round-trip completes, which is what `AuthContext`'s loading state covers.
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Store the access token for subsequent requests. Pass null to drop it without
 * flushing in-flight GETs - see `clearAccessToken` for sign-out.
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Drop the access token *and* every in-flight GET, for sign-out.
 *
 * Flushing the dedupe map is the part that matters: those promises were issued as the
 * previous session and are still shareable by key, so leaving them would let a request
 * made after sign-out resolve with the previous user's data.
 */
export function clearAccessToken(): void {
  accessToken = null;
  // Drop any in-flight GETs along with the token. They were issued as the
  // previous session and their promises are still shareable by key, so without
  // this a request that started just before a session swap could be handed to a
  // caller running as the next one.
  pendingGetRequests.clear();
}

// Tracks an in-flight `/auth/refresh` call so concurrent callers (e.g. React
// Strict Mode's double-invoked effects in development, or several requests
// 401-ing at once) share a single request/response instead of each firing
// their own - the httpOnly refresh cookie is typically single-use, so
// racing requests could otherwise invalidate each other.
let pendingRefresh: Promise<string> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token, storing it
 * in memory. Used both on page load and by the response interceptor below
 * when a request comes back 401. Uses a bare `axios` call rather than
 * `apiClient` to avoid recursing into these same interceptors.
 */
export async function refreshAccessToken(): Promise<string> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = (async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const { access_token } = response.data;
      setAccessToken(access_token);
      return access_token;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

/**
 * API client configuration
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important for cookies (refresh token)
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Axios hangs the request `config` off every error it rejects with, and that
// config still carries the `Authorization: Bearer ...` header the request
// interceptor above added. Any `console.error(..., error)` therefore prints the
// access token to the console - and, the day an error-reporting SDK
// (Sentry/LogRocket/RUM) is added, serializes it into a third party's storage.
// That would quietly undo the point of keeping the token in memory only, so it
// is scrubbed here, at the one place every rejection passes through, rather
// than by auditing 40-odd call sites.
//
// The header is re-added per request by the request interceptor, so removing it
// from the error copy costs nothing - including for the 401 retry below, which
// sets its own fresh `Authorization` before replaying.
function scrubAuthorizationHeader(error: unknown): void {
  const headers = (error as { config?: { headers?: Record<string, unknown> } })
    ?.config?.headers;
  if (headers) {
    delete headers.Authorization;
  }
}

/**
 * Axios applies the request's `responseType` to error responses as well, so a
 * failed `responseType: "blob"` request (certification card images, dive source
 * files) arrives with its *error* body wrapped in a Blob too. `getApiErrorMessage`
 * then looks for `response.data.detail` on a Blob, finds `undefined`, and the call
 * site shows its generic fallback - even though the API sent a perfectly good
 * `{"detail": "This dive has no profile"}` with `content-type: application/json`
 * (every binary route raises an ordinary `HTTPException`, so the route's declared
 * `media_type` never applies to a failure).
 *
 * Unwrapping it here, at the one place every rejection already passes through,
 * keeps all ~26 `getApiErrorMessage` call sites synchronous rather than forcing an
 * async variant onto the handful that happen to fetch binary.
 * Exported for tests only - it is wired into the interceptor below, not called
 * directly by anything else.
 */
export async function unwrapBlobErrorBody(error: unknown): Promise<void> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (!(response?.data instanceof Blob)) return;

  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    // A genuinely binary, truncated, or non-JSON error body. Leave `data` as the
    // Blob so the caller's fallback message is used - throwing from inside the
    // interceptor would replace the real error with a parse error.
  }
}

// The endpoints whose job is to *establish* a session rather than to use one.
// `/auth/logout` is deliberately absent: it needs a live access token to blacklist
// the pair, so refreshing and retrying it is exactly right.
const SESSION_MINTING_PATHS = new Set([
  "/auth/refresh",
  "/auth/email/verify",
  "/auth/email/verify-code",
  "/auth/google",
  "/auth/passkey/verify",
  "/auth/complete",
  "/auth/restore",
]);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Before any branch below rejects: the check is a synchronous `instanceof`,
    // so JSON responses (the overwhelming majority, including the 401s that
    // drive the refresh path) pay nothing for it.
    await unwrapBlobErrorBody(error);

    // A 401 from any of these is the endpoint refusing the credential in the
    // *body* - an expired magic link, a wrong sign-in code, a rejected Google
    // assertion, a stale onboarding token, a missing refresh cookie. None of them
    // can be fixed by minting a fresh access token, and sending them down the
    // refresh path below actively makes things worse: the caller ends up holding
    // whatever the *refresh* failed with instead of the API's own explanation, so
    // a signed-out visitor who mistypes their sign-in code is told "Refresh token
    // missing." `/auth/refresh` itself is here for the older reason - retrying it
    // through a refresh recurses into the same failure.
    const isAuthEndpoint = SESSION_MINTING_PATHS.has(originalRequest?.url);

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        const access_token = await refreshAccessToken();

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear the token and let AuthContext know the
        // session expired so it can clear its user state; the app's existing
        // per-page auth guards will then redirect via the Next.js router.
        clearAccessToken();
        window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
        scrubAuthorizationHeader(refreshError);
        return Promise.reject(refreshError);
      }
    }

    scrubAuthorizationHeader(error);
    return Promise.reject(error);
  },
);

// The key has to cover `responseType` as well as the URL and params: the same
// endpoint is fetched as JSON in one place and as a `blob` in another (card
// images, dive files), and sharing one promise between those two would hand a
// caller a body of the wrong type entirely.
function getRequestKey(url: string, config?: AxiosRequestConfig): string {
  return `${url}?${JSON.stringify(config?.params ?? {})}&${
    config?.responseType ?? "json"
  }`;
}

const rawGet: (
  url: string,
  config?: AxiosRequestConfig,
) => Promise<AxiosResponse> = apiClient.get.bind(apiClient);

apiClient.get = ((url: string, config?: AxiosRequestConfig) => {
  const key = getRequestKey(url, config);
  const pending = pendingGetRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = rawGet(url, config).finally(() => {
    pendingGetRequests.delete(key);
  });
  pendingGetRequests.set(key, request);
  return request;
}) as typeof apiClient.get;

// The envelope every list endpoint returns (fastcrud's `PaginatedListResponse`).
// It lives here, in the lowest layer, because `lib/api/*` is what produces it -
// it used to be declared in `hooks/usePaginatedResource.ts`, a layer *above*
// `lib/api/`, which is why eight modules each redeclared their own copy rather
// than import upwards.
//
// All five fields are declared, matching the eight per-resource copies this
// replaces. Nothing in the app reads `page`/`items_per_page` - `total_count` and
// `has_more` drive every list footer - but they are always on the wire, so
// omitting them (as the `hooks/` copy did) made the envelope look like it had
// three fields. Note the API clamps both, so the `items_per_page` echoed back can
// be smaller than the one requested.
export interface PaginatedResponse<T> {
  data: T[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export interface FetchAllPagesOptions<T> {
  // Ceiling on requests, not on items. 20 pages x 100 items is far past what any
  // of the "fetch everything" call sites are actually sized for.
  maxPages?: number;
  itemsPerPage?: number;
  // Stops the loop between pages. It does not abort the request already in
  // flight - the API modules take no axios config - but it does stop a card that
  // unmounted mid-fetch from walking the rest of a user's history.
  signal?: AbortSignal;
  // Identifies which resource ran long, in the truncation warning.
  label?: string;
  // Enables dedup across pages. See the snapshot note below - without a key
  // there is no way to tell a genuine repeat from two distinct items.
  keyOf?: (item: T) => string;
}

// Raised when `signal` is already aborted. A `DOMException` named `AbortError` so
// it matches what `fetch`/axios throw and `isAbortError` below can recognise it
// whatever produced it.
function abortError(): Error {
  return new DOMException("Paged fetch aborted", "AbortError");
}

/**
 * True for the rejection a cancelled request/loop produces. Call sites use it to
 * tell "the user navigated away" apart from "the request failed", which should
 * not be logged or toasted as an error.
 */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: string })?.name === "AbortError";
}

/**
 * Walks every page of a list endpoint and returns the items as one array.
 *
 * This replaces four hand-rolled `while (hasMore)` loops. They were not the
 * infinite-loop hazard they looked like - the API clamps `items_per_page` to 100
 * and computes `has_more` as `page * items_per_page < total_count`, so `page`
 * outruns any realistic insert rate - but they were unbounded, uncancellable, and
 * silent about it.
 *
 * The real hazard is subtler and is why `keyOf` exists: list pages are cached for
 * 60 seconds under a per-`page` key, so a loop can stitch together *different
 * snapshots*. An insert between page 1 and page 2 shifts every later row down one
 * and the boundary item is fetched twice. Deduping by identity fixes the
 * duplicate half of that. The gap half - an item pushed from page 2 to page 3 by
 * a delete - cannot be fixed from here; a caller that needs a consistent view
 * wants a single-shot endpoint instead (`/gear-service-due` is the one that has
 * one).
 */
export async function fetchAllPages<T>(
  fetchPage: (
    page: number,
    itemsPerPage: number,
  ) => Promise<PaginatedResponse<T>>,
  {
    maxPages = 20,
    itemsPerPage = 100,
    signal,
    label = "resource",
    keyOf,
  }: FetchAllPagesOptions<T> = {},
): Promise<T[]> {
  const all: T[] = [];
  const seen = keyOf ? new Set<string>() : null;

  for (let page = 1; page <= maxPages; page += 1) {
    if (signal?.aborted) throw abortError();

    const response = await fetchPage(page, itemsPerPage);

    for (const item of response.data) {
      if (seen && keyOf) {
        const key = keyOf(item);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      all.push(item);
    }

    if (!response.has_more) return all;
  }

  // Reached only by exhausting `maxPages` with the API still reporting more.
  // Warned rather than thrown: a dashboard card showing the first 2000 items is
  // better than one showing an error, but a short list that looks complete is how
  // "my oldest certification stopped appearing" becomes unexplainable.
  console.warn(
    `fetchAllPages: stopped after ${maxPages} pages of ${label}; the list is truncated at ${all.length} items.`,
  );
  return all;
}
