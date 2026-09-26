// The README's pitch, shared by the root layout's metadata and the web app manifest. It
// leads with what the log is rather than with how it is deployed: every instance serves
// it, and "a self-hosted dive log" is a claim about the reader's server that the reader
// may well not be the one running. See "Self-hosting is a capability, not the product's
// identity" in DECISIONS.md.
//
// It does not promise the imported file back. A logbook the API converts is read once
// and discarded, so the promise is true only of a file uploaded to a dive - a qualifier
// the README's body has room for and a one-line pitch does not. See "'The original file
// is kept' is a claim about an upload to a dive" in DECISIONS.md; the front door's
// README carries the replacement clause verbatim.
export const SITE_DESCRIPTION =
  "A dive log built to outlive every vendor. Your dives, your data - vendor exports in, open formats out, everything in one click. Yours to self-host.";
