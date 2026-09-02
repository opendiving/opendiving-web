import { describe, expect, it } from "vitest";
import { WebAuthnError } from "@simplewebauthn/browser";
import { isCeremonyDismissed } from "./passkey-ceremony";

// Against the real `WebAuthnError`, deliberately. What this function reads is
// v13's own two-field convention - a documented `code`, plus a `name` copied off
// the wrapped `DOMException` - and a stand-in class would only ever prove that
// the test author agrees with themselves about it.
function webAuthnError(code: string, name?: string): WebAuthnError {
  return new WebAuthnError({
    message: "ceremony failed",
    code: code as ConstructorParameters<typeof WebAuthnError>[0]["code"],
    cause: new Error("cause"),
    name,
  });
}

describe("isCeremonyDismissed", () => {
  // How v13 reports a ceremony cancelled by an abort signal - the sign-in hook's
  // own cleanup, and v13 standing one ceremony down because another started.
  it("recognises an aborted ceremony by its code", () => {
    expect(isCeremonyDismissed(webAuthnError("ERROR_CEREMONY_ABORTED"))).toBe(
      true,
    );
  });

  // A dismissed sheet: every spec error v13 declines to reinterpret shares one
  // code, so the copied `name` is the only thing left to read it by.
  it("recognises a dismissed sheet by the copied DOMException name", () => {
    expect(
      isCeremonyDismissed(
        webAuthnError(
          "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          "NotAllowedError",
        ),
      ),
    ).toBe(true);
  });

  // The whole point of the function: a real failure has to be reported, and
  // these are the ones a diver can act on (a security key that can't hold a
  // discoverable credential, an already-registered authenticator).
  it("reports a real ceremony failure", () => {
    expect(
      isCeremonyDismissed(
        webAuthnError("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"),
      ),
    ).toBe(false);
    expect(
      isCeremonyDismissed(
        webAuthnError(
          "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        ),
      ),
    ).toBe(false);
  });

  // Everything the API can throw arrives here too - a 409 from the registration
  // verify is not somebody closing a dialog.
  it("says nothing about errors that aren't ceremony errors", () => {
    expect(isCeremonyDismissed(new Error("Network Error"))).toBe(false);
    expect(isCeremonyDismissed({ name: "NotAllowedError" })).toBe(false);
    expect(isCeremonyDismissed(undefined)).toBe(false);
  });
});
