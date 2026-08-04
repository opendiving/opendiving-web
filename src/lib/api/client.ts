import axios from "axios";

// Dispatched when a token refresh fails so `AuthContext` can clear the stale
// user; existing per-page "redirect to /signin when unauthenticated" guards
// then handle navigation via Next's router instead of a hard page reload.
export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";

// API client configuration
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important for cookies (refresh token)
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/refresh`,
          {},
          { withCredentials: true },
        );

        const { access_token } = response.data;
        localStorage.setItem("access_token", access_token);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear the token and let AuthContext know the
        // session expired so it can clear its user state; the app's existing
        // per-page auth guards will then redirect via the Next.js router.
        localStorage.removeItem("access_token");
        window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
