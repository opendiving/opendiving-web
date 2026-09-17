import {
  apiClient,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./client";
import type { UnitSystem } from "@/lib/units";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";

export interface User {
  uuid: string;
  name: string;
  username: string;
  email: string;
  // The stored avatar's digest, or null when this diver has no picture and the app
  // draws initials. There is no URL here on purpose: the bytes are owner-only and an
  // `<img src>` cannot carry a bearer token, so they are fetched through the API
  // client (`getAvatarBlob`). The digest is also the version - it is the `ETag` on
  // the download and the `?v=` token that gives each replacement its own cache
  // entry, so a new picture is visible immediately and an unchanged one is never
  // re-fetched. Optional for the same reason as `gear_service_emails` below.
  avatar_sha256?: string | null;
  // Whether to email this user when their gear is due for servicing. Opt-out, so it
  // defaults to true server-side; optional here so a response from an API that predates
  // the field still type-checks.
  gear_service_emails?: boolean;
  // Which system every measurement in the app is rendered and entered in. Not
  // optional, unlike `gear_service_emails` above: the column is `NOT NULL` with a
  // server default, so a response either carries it or comes from an API this build
  // cannot talk to anyway (`PATCH /user` would 422 on the settings card's own field).
  units: UnitSystem;
  // Which dive-form fields this diver keeps hidden, in the API's canonical order
  // (form order, duplicates collapsed) - so the Fields surfaces decide which preset
  // matches by comparing this list element by element.
  //
  // Not optional, for the same reason as `units` directly above and unlike
  // `gear_service_emails`: the column is `NOT NULL` with a server default, so a
  // response either carries it or comes from an API this build cannot talk to anyway.
  // It reaches the dive form with the signed-in user record rather than through a
  // fetch of its own, which is what lets the form's *first paint* already omit the
  // hidden fields instead of showing them and taking them away.
  dive_form_hidden_fields: DiveFormFieldKey[];
  // What a dive shop asks for at the desk, kept once instead of written out on
  // arrival: the diver's own details, somebody to call, and the insurance a desk
  // wants the name and number of. All eight are nullable columns and a diver who
  // has filled none of them is the ordinary state, so `null` here means "not
  // filled in" rather than "unknown" - a reader prints nothing for it rather than
  // a labelled blank.
  //
  // Optional as well as nullable, unlike `units` and `dive_form_hidden_fields`
  // above: those are `NOT NULL` with a server default, so their absence could only
  // mean an API this build cannot talk to. These carry no default, so absent and
  // null say the same thing, and a response from an API that predates them still
  // type-checks.
  //
  // The two dates are bare `YYYY-MM-DD` strings and must be read with
  // `formatDateOnly` rather than `new Date(...)` - see DECISIONS.md.
  date_of_birth?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  insurance_expires_on?: string | null;
  // Whether this account holds the operator's rights - the caller's own record on
  // `GET /user` (the backend's `UserRead.is_superuser`), never a disclosure about
  // anybody else. It is what the header uses to offer the `/admin` section at all.
  //
  // Optional, and read as false when absent, for the same reason as
  // `gear_service_emails`: a response from an API that predates the field still has
  // to type-check. Absent is the right default anyway - this is the field that opens
  // a door, so an instance that cannot say yes must not be read as having said it.
  //
  // The web gate this feeds is a convenience, never the protection: every
  // `/admin/*` route is superuser-gated on the API, which is what actually refuses
  // a diver who edits this out of a response.
  is_superuser?: boolean;
}

// Mirrors the backend's `AuthOutcome` (see `schemas/auth.py`), and it has three
// shapes rather than two: the caller is signed straight in, no account exists yet for
// the verified identity (`onboarding_token` goes to `completeProfile`), or an account
// does exist and is inside its deletion grace period (`restore_token` goes to
// `restoreAccount`).
//
// The third is not a session and not a failure: nothing was written and no token was
// issued, so a caller that treats it as either is wrong in a way the type system
// cannot catch. Branch on `status`, never on "did an access token come back".
export type AuthStatus =
  "authenticated" | "onboarding_required" | "deletion_pending";

export interface AuthOutcome {
  status: AuthStatus;
  access_token?: string;
  token_type?: string;
  onboarding_token?: string;
  // Set only when status is "deletion_pending". `purge_after` is the date the account
  // stops being recoverable at all, and the API leaves it out for a row flagged with
  // no clock to count from - so the screen showing it has to cope with its absence.
  restore_token?: string;
  purge_after?: string;
  email?: string;
  name?: string;
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
  // Replaced wholesale - there is no "hide one more" verb, because the Fields dialog
  // holds the whole set and sends it. Any order is accepted and stored canonically;
  // this client sends the canonical form anyway so what it holds and what came back
  // cannot differ. An explicit `null` is a 422.
  dive_form_hidden_fields?: DiveFormFieldKey[];
  // The check-in details. An explicit `null` clears one, unlike
  // `dive_form_hidden_fields` above, and the check-in card sends all eight on
  // every save - so a group the diver emptied arrives as nulls rather than being
  // left behind. The string bounds are the columns' own, and `PATCH /user` is
  // `extra="forbid"`, so an over-long value is a 422; `checkInDetailsSchema`
  // mirrors them.
  date_of_birth?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  insurance_expires_on?: string | null;
}

/**
 * What the file picker offers for an avatar, mirroring the four formats the API can
 * decode.
 *
 * **Spelled out rather than `image/*`, and that is load-bearing.** Since WebKit's
 * 2024 change, iOS Safari transcodes a HEIC pick to JPEG only when the `accept` list
 * restricts image types and excludes HEIC; `image/*` hands over raw HEIC, which no
 * browser can decode into a canvas and the API rejects. Never add `image/heic` here
 * either - Safari then delivers the original HEIC and has a documented bug converting
 * picked PNGs *to* HEIC. A pick made through the Files app bypasses `accept`
 * entirely, so this is convenience, not validation: the API decodes the bytes and is
 * the only authority on what they are.
 */
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** The API's own upload ceiling, mirrored so an oversize file fails before the round trip. */
export const MAX_AVATAR_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

/** `PUT /user/avatar`'s body: the stored image's digest, which is also its version. */
export interface AvatarUploadResult {
  sha256: string;
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
  // Set only by the sign-in precheck, and only for a link into an account inside its
  // deletion grace period. Deliberately `valid: true` plus a flag rather than a fourth
  // way to be invalid: the link works, and redeeming it reaches the restore offer. See
  // `LinkCheckResponse` in the API's `schemas/auth.py`.
  deletion_pending?: boolean;
  purge_after?: string;
}

// What a completed trip to Google comes back with, ready for the API to redeem.
// Minted and stored per attempt by `lib/google-oauth.ts`, and read out again by
// the callback route; snake_cased into the request body by `signInWithGoogle`,
// which is the only place these names cross into the API's spelling.
export interface GoogleAuthorizationGrant {
  // Google's single-use `?code=`. Worthless without the two below and the API's
  // client secret, which is why it is safe for it to have travelled through the
  // browser at all.
  code: string;
  // The PKCE verifier whose SHA-256 the authorization request committed to. The
  // API validates it to RFC 7636 §4.1's shape and answers 422 to anything else.
  codeVerifier: string;
  // The redirect URI the browser actually used. Google requires the exchange to
  // repeat it, and the API refuses to exchange against any URI but the one its
  // own `FRONTEND_URL` derives - which is what makes a misconfigured deployment
  // this app's own named error rather than an opaque rejection from Google.
  redirectUri: string;
}

// Every call that can hand back a session does the same thing with it: the access
// token lives in memory only (see `client.ts`), so it has to be captured as the
// response goes past rather than re-read from anywhere later.
//
// Exported for `lib/api/passkeys.ts`, which is a second module speaking the same
// `AuthOutcome` - the passkey ceremony ends in the API's one shared funnel, so it
// hands back exactly this shape and has exactly this to do with it.
export function captureSession(outcome: AuthOutcome): AuthOutcome {
  if (outcome.status === "authenticated" && outcome.access_token) {
    setAccessToken(outcome.access_token);
  }
  return outcome;
}

/**
 * Sign-in, sign-out and onboarding calls.
 *
 * Every entry point (the magic link, the code printed beside it, Google) can land on
 * any of three outcomes - an existing user is signed in, a verified identity with no
 * account yet gets an onboarding token to hand to `completeOnboarding`, or an account
 * inside its deletion grace period gets a restore token to hand to `restoreAccount`.
 * Callers have to branch on `status` rather than assuming a session came back.
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

  // Sign in (or start onboarding for a new account) with Google.
  //
  // What travels here is a single-use authorization code, not an identity. The
  // backend redeems it at Google's token endpoint using its own client secret and
  // the PKCE verifier this browser minted, verifies the ID token that comes back,
  // and finds-or-creates the matching identity. Nothing Google issues that
  // identifies anyone ever passes through the browser, which is why a code that
  // did is safe to have travelled this way.
  async signInWithGoogle(
    grant: GoogleAuthorizationGrant,
  ): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/google", {
      code: grant.code,
      code_verifier: grant.codeVerifier,
      redirect_uri: grant.redirectUri,
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

  // The second half of a `deletion_pending` outcome, and the only thing that undoes a
  // deletion: the four entry points verify an identity and hand back a `restore_token`,
  // and the account stays deleted until this runs. Signs the restored account back in
  // on success, so it resolves with an `authenticated` outcome like the others.
  //
  // The token is single-use and short-lived (it expires with an onboarding token), and
  // a 401 here is worth showing verbatim: it distinguishes a spent or expired token
  // from an account whose grace period ran out while the offer was on screen.
  async restoreAccount(restoreToken: string): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/restore", {
      restore_token: restoreToken,
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

  // Set or replace the caller's avatar. `PUT`, because there is one avatar per
  // account and uploading again overwrites it.
  //
  // What comes back out is not what goes in: the API decodes, orients from EXIF,
  // crops square, bounds to 512 px and re-encodes as WebP - which is what strips the
  // metadata a phone photo carries, GPS included. So the digest it returns describes
  // the *stored* image, and nothing about the upload (size, type, filename) survives
  // to be echoed back.
  //
  // `Content-Type: undefined` lets the browser set the multipart boundary; axios
  // cannot know it. Same shape as the certification card upload.
  async uploadAvatar(
    file: Blob,
    filename: string,
  ): Promise<AvatarUploadResult> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const response = await apiClient.put<AvatarUploadResult>(
      "/user/avatar",
      formData,
      { headers: { "Content-Type": undefined } },
    );
    return response.data;
  },

  // Remove the caller's avatar, leaving the account alone. 404 when there was none.
  async removeAvatar(): Promise<void> {
    await apiClient.delete("/user/avatar");
  },

  // Fetch the caller's own avatar bytes as a Blob.
  //
  // Through the API client rather than an `<img src>` for the same reason as card
  // images: the endpoint is owner-only and needs an `Authorization` header, which an
  // `<img>` cannot send (the access token lives in memory, not in a cookie). Callers
  // turn the Blob into an object URL - see `hooks/useAuthedBlobUrl.ts`.
  //
  // `version` is `User.avatar_sha256`, sent as a `v` query param the API ignores. Its
  // job is to give each version of the picture its own URL: the response is cached
  // with `max-age=300`, so without it the browser would keep serving the old bytes
  // from its own cache for five minutes after a replace, however correctly the app
  // refetches. Stable while the avatar is unchanged, so repeat mounts still hit the
  // cache (and revalidate against the `ETag` after that).
  async getAvatarBlob(version?: string): Promise<Blob> {
    const response = await apiClient.get("/user/avatar", {
      responseType: "blob",
      params: version ? { v: version } : undefined,
    });
    return response.data;
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
