import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// Dispatched when a token refresh fails so `AuthContext` can clear the stale
// user; existing per-page "redirect to /signin when unauthenticated" guards
// then handle navigation via Next's router instead of a hard page reload.
export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

// Tracks an in-flight `/refresh` call so concurrent callers (e.g. React
// Strict Mode's double-invoked effects in development, or several requests
// 401-ing at once) share a single request/response instead of each firing
// their own - the httpOnly refresh cookie is typically single-use, so
// racing requests could otherwise invalidate each other.
let pendingRefresh: Promise<string> | null = null;

// Exchanges the httpOnly refresh cookie for a new access token, storing it
// in memory. Used both on page load and by the response interceptor below
// when a request comes back 401. Uses a bare `axios` call rather than
// `apiClient` to avoid recursing into these same interceptors.
export async function refreshAccessToken(): Promise<string> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = (async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/refresh`,
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

// API client configuration
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

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // A 401 from these endpoints reflects bad credentials or a missing/
    // invalid refresh token itself, not an expired access token - retrying
    // them via a token refresh would replace the real "wrong username, email
    // or password" (or similar) error with an unrelated refresh failure.
    const isAuthEndpoint =
      originalRequest?.url === "/login" || originalRequest?.url === "/refresh";

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
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// De-duplicates concurrent, identical in-flight GET requests so callers
// (e.g. two components independently fetching the same data, or React
// Strict Mode's double-invoked effects in development) share a single
// network request/response instead of each firing their own. Safe for GETs
// since they're idempotent; mutating verbs (POST/PATCH/DELETE) intentionally
// aren't touched here.
const pendingGetRequests = new Map<string, Promise<AxiosResponse>>();

function getRequestKey(url: string, config?: AxiosRequestConfig): string {
  return `${url}?${JSON.stringify(config?.params ?? {})}`;
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
