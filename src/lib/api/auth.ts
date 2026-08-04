import { apiClient } from "./client";

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
  id: number;
  name: string;
  username: string;
  email: string;
  profile_image_url: string;
  tier_id: number | null;
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

    // Store the access token
    localStorage.setItem("access_token", response.data.access_token);

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
      // Always remove token from localStorage
      localStorage.removeItem("access_token");
    }
  },

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get("/user/me");
    return response.data;
  },

  // Update user profile
  async updateProfile(
    userId: number,
    profileData: UpdateProfileData,
  ): Promise<void> {
    await apiClient.patch(`/user/${userId}`, profileData);
  },

  // Change password
  async changePassword(
    userId: number,
    passwordData: ChangePasswordData,
  ): Promise<void> {
    await apiClient.patch(`/user/${userId}/password`, passwordData);
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!localStorage.getItem("access_token");
  },
};
