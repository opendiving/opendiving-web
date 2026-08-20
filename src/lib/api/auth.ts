import {
  apiClient,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./client";
import type { UnitSystem } from "@/lib/units";

export interface User {
  uuid: string;
  name: string;
  username: string;
  email: string;
  profile_image_url: string;
  // Whether to email this user when their gear is due for servicing. Opt-out, so it
  // defaults to true server-side; optional here so a response from an API that predates
  // the field still type-checks.
  gear_service_emails?: boolean;
  // Which system every measurement in the app is rendered and entered in. Not
  // optional, unlike `gear_service_emails` above: the column is `NOT NULL` with a
  // server default, so a response either carries it or comes from an API this build
  // cannot talk to anyway (`PATCH /user` would 422 on the settings card's own field).
  units: UnitSystem;
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

// Mirrors the backend's response to `POST /auth/email/request`: the same generic
// message for every address (see `requestEmailLink`), plus the id of the request
// row it just minted. That id is handed only to the browser that asked, and is what
// names the row to `verifyEmailCode` - so the code in the email is reachable only
// from the tab that requested it, and nobody can burn someone else's five attempts
// by knowing their address.
export interface EmailLinkRequestResult {
  message: string;
  request_id: string;
}

export interface UpdateProfileData {
  name?: string;
  username?: string;
  gear_service_emails?: boolean;
  units?: UnitSystem;
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

// Every call that can hand back a session does the same thing with it: the access
// token lives in memory only (see `client.ts`), so it has to be captured as the
// response goes past rather than re-read from anywhere later.
function captureSession(outcome: AuthOutcome): AuthOutcome {
  if (outcome.status === "authenticated" && outcome.access_token) {
    setAccessToken(outcome.access_token);
  }
  return outcome;
}

/**
 * Sign-in, sign-out and onboarding calls.
 *
 * Every entry point (the magic link, the code printed beside it, Google) can land on
 * either of two outcomes - an existing user is signed in, or a verified identity with
 * no account yet gets an onboarding token to hand to `completeOnboarding`. Callers have
 * to branch on `status` rather than assuming a session came back.
 */
export const authAPI = {
  // Step 1 of the email flow: always resolves with the same generic message,
  // whether or not `email` belongs to an existing account. The `request_id` beside
  // it names the request row the email is about, and is what `verifyEmailCode`
  // needs - keep it for as long as the "check your email" card is on screen.
  async requestEmailLink(email: string): Promise<EmailLinkRequestResult> {
    const response = await apiClient.post<EmailLinkRequestResult>(
      "/auth/email/request",
      { email },
    );
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
    return captureSession(response.data);
  },

  // The other half of the same email: the six-digit code printed beside the link,
  // typed into the tab that asked for it. `requestId` is what `requestEmailLink`
  // returned - the row cannot be named without it, which is what keeps a stranger
  // who merely knows the address from guessing at someone else's code. Same two
  // outcomes as the link, since it claims the same row.
  async verifyEmailCode(requestId: string, code: string): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>(
      "/auth/email/verify-code",
      { request_id: requestId, code },
    );
    return captureSession(response.data);
  },

  // Sign in (or start onboarding for a new account) with Google. `credential` is
  // the ID token JWT handed to us by Google Identity Services after the user picks
  // an account - the backend verifies it and finds-or-creates the matching identity.
  async signInWithGoogle(credential: string): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/google", {
      credential,
    });
    return captureSession(response.data);
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
    return captureSession(response.data);
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
