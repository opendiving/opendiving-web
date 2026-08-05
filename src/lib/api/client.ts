import axios from "axios";

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

// Exchanges the httpOnly refresh cookie for a new access token, storing it
// in memory. Used both on page load and by the response interceptor below
// when a request comes back 401. Uses a bare `axios` call rather than
// `apiClient` to avoid recursing into these same interceptors.
export async function refreshAccessToken(): Promise<string> {
  const response = await axios.post(
    `${API_BASE_URL}/refresh`,
    {},
    { withCredentials: true },
  );
  const { access_token } = response.data;
  setAccessToken(access_token);
  return access_token;
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
