// Tells this browser's other tabs that the session just ended here.
//
// Signing out and deleting the account both revoke the session on the server, and
// both leave the tab that did it with a page load. Every other tab would keep showing
// what it had already fetched - dives, a name, private card scans held as blob URLs -
// until its next request happened to fail. `AuthProvider` listens and leaves too.
//
// One channel per document, and it is the one that posts: `BroadcastChannel` delivers
// to every *other* instance of the name, including others in the same tab, so a
// second instance here would hear this tab's own message and race its navigation.
//
// The name carries no `opendiving:` prefix on purpose. That prefix marks browser
// storage keys, which `lib/storage-keys.test.ts` sends to the privacy page; a channel
// stores nothing, and a message nobody is listening for is simply dropped.

const CHANNEL_NAME = "auth";
const SIGNED_OUT = "signed-out";

let channel: BroadcastChannel | null | undefined;

// Lazy, and `null` where the API is missing (Safari before 15.4): the tabs then
// find out the old way, on their next failed request.
function authChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Tells the other tabs the session has ended. Call once the server confirmed it. */
export function announceSignedOut(): void {
  authChannel()?.postMessage(SIGNED_OUT);
}

/**
 * Runs `listener` when another tab ends the session. Returns the unsubscribe.
 */
export function onSignedOutElsewhere(listener: () => void): () => void {
  const current = authChannel();
  if (!current) return () => {};
  const handle = (event: MessageEvent) => {
    if (event.data === SIGNED_OUT) listener();
  };
  current.addEventListener("message", handle);
  return () => current.removeEventListener("message", handle);
}
