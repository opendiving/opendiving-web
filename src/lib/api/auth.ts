import {
  apiClient,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./client";

export interface User {
  uuid: string;
  name: string;
  username: string;
  email: string;
  profile_image_url: string;
}

// Mirrors the backend's `AuthOutcome` (see `schemas/auth.py`): either the caller is
// signed straight in, or no account exists yet for the verified identity and
// `onboarding_token` must be carried forward to `completeProfile`.
export interface AuthOutcome {
  status: "authenticated" | "onboarding_required";
  access_token?: string;
  token_type?: string;
  onboarding_token?: string;
  email?: string;
  name?: string;
  avatar?: string;
}

export interface UpdateProfileData {
  name?: string;
  username?: string;
}

export interface EmailChangeResponse {
  message: string;
}

export interface EmailChangeVerifyResult {
  message: string;
  email: string;
}

// Mirrors the backend's `LinkCheckResponse` - the result of a side-effect-free
// precheck of a magic-link/confirmation token, used to decide whether to show a
// confirmation button at all before the user acts on it.
export interface LinkCheckResult {
  valid: boolean;
  email?: string;
}

export const authAPI = {
  // Step 1 of the email flow: always resolves with the same generic message,
  // whether or not `email` belongs to an existing account.
  async requestEmailLink(email: string): Promise<{ message: string }> {
    const response = await apiClient.post("/auth/email/request", { email });
    return response.data;
  },

  // Side-effect-free precheck of a sign-in link, used by the verify landing page
  // to decide whether to show the "Sign in" button at all (e.g. a link revisited
  // via the browser's back button after already signing in should show an error
  // immediately, not a misleadingly clickable button).
  async checkEmailLink(token: string): Promise<LinkCheckResult> {
    const response = await apiClient.get<LinkCheckResult>(
      "/auth/email/verify/check",
      { params: { token } },
    );
    return response.data;
  },

  // Step 2 of the email flow: validates the magic-link token from the URL the user
  // clicked, and either signs them in or hands back an onboarding session.
  async verifyEmailLink(token: string): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/email/verify", {
      token,
    });
    if (response.data.status === "authenticated" && response.data.access_token) {
      setAccessToken(response.data.access_token);
    }
    return response.data;
  },

  // Sign in (or start onboarding for a new account) with Google. `credential` is
  // the ID token JWT handed to us by Google Identity Services after the user picks
  // an account - the backend verifies it and finds-or-creates the matching identity.
  async signInWithGoogle(credential: string): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/google", {
      credential,
    });
    if (response.data.status === "authenticated" && response.data.access_token) {
      setAccessToken(response.data.access_token);
    }
    return response.data;
  },

  // Creates the account for a verified identity that had no user record yet, then
  // signs the new user in. The only place a `User` row is ever created.
  async completeProfile(
    onboardingToken: string,
    name: string,
    username: string,
  ): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/complete", {
      onboarding_token: onboardingToken,
      name,
      username,
    });
    if (response.data.status === "authenticated" && response.data.access_token) {
      setAccessToken(response.data.access_token);
    }
    return response.data;
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      // Always drop the in-memory token, even if the logout request failed
      clearAccessToken();
    }
  },

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get("/user");
    return response.data;
  },

  // Update the signed-in caller's own profile (name/username only - see
  // requestEmailChange/verifyEmailChange below for the only way to change
  // `email`). Always operates on the caller's own account - no uuid parameter.
  async updateProfile(profileData: UpdateProfileData): Promise<void> {
    await apiClient.patch("/user", profileData);
  },

  // Step 1 of changing an account's email: always resolves with the same generic
  // message, whether or not `newEmail` already belongs to another account. The
  // change doesn't take effect until the emailed confirmation link is clicked.
  // Always operates on the signed-in caller's own account - no uuid parameter.
  async requestEmailChange(newEmail: string): Promise<EmailChangeResponse> {
    const response = await apiClient.post("/user/email-change/request", {
      new_email: newEmail,
    });
    return response.data;
  },

  // Side-effect-free precheck of an email-change confirmation link, used by the
  // confirmation page to decide whether to show the "Confirm email change" button
  // at all (e.g. a link revisited via the browser's back button after already
  // confirming should show an error immediately, not a misleadingly clickable
  // button), and to display the target email up front.
  async checkEmailChangeLink(token: string): Promise<LinkCheckResult> {
    const response = await apiClient.get<LinkCheckResult>(
      "/user/email-change/verify/check",
      { params: { token } },
    );
    return response.data;
  },

  // Step 2: validates the confirmation link's token and applies the email change.
  async verifyEmailChange(token: string): Promise<EmailChangeVerifyResult> {
    const response = await apiClient.post<EmailChangeVerifyResult>(
      "/user/email-change/verify",
      { token },
    );
    return response.data;
  },

  // Whether we currently hold an access token in memory. Note this only
  // reflects the current tab/page load - use `refreshAccessToken` (from
  // `./client`) to re-derive a token from the httpOnly refresh cookie, e.g.
  // on initial page load.
  isAuthenticated(): boolean {
    return !!getAccessToken();
  },
};
