import { apiClient, clearAccessToken, getAccessToken, setAccessToken } from "./client";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SignUpData {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface User {
  uuid: string;
  name: string;
  username: string;
  email: string;
  profile_image_url: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UpdateProfileData {
  name?: string;
  username?: string;
  email?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export const authAPI = {
  // Sign in
  async signIn(credentials: LoginCredentials): Promise<AuthResponse> {
    const formData = new FormData();
    formData.append("username", credentials.username);
    formData.append("password", credentials.password);

    const response = await apiClient.post("/login", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Keep the access token in memory only (see client.ts) rather than
    // persisting it client-side.
    setAccessToken(response.data.access_token);

    return response.data;
  },

  // Sign up
  async signUp(userData: SignUpData): Promise<User> {
    const response = await apiClient.post("/user", userData);
    return response.data;
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await apiClient.post("/logout");
    } finally {
      // Always drop the in-memory token, even if the logout request failed
      clearAccessToken();
    }
  },

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get("/user/me");
    return response.data;
  },

  // Update user profile
  async updateProfile(
    userUuid: string,
    profileData: UpdateProfileData,
  ): Promise<void> {
    await apiClient.patch(`/user/${userUuid}`, profileData);
  },

  // Change password
  async changePassword(
    userUuid: string,
    passwordData: ChangePasswordData,
  ): Promise<void> {
    await apiClient.patch(`/user/${userUuid}/password`, passwordData);
  },

  // Whether we currently hold an access token in memory. Note this only
  // reflects the current tab/page load - use `refreshAccessToken` (from
  // `./client`) to re-derive a token from the httpOnly refresh cookie, e.g.
  // on initial page load.
  isAuthenticated(): boolean {
    return !!getAccessToken();
  },
};
