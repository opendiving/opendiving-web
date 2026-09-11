// "Don't remember display preferences on this device" - one switch, and the
// whole of its logic.
//
// UK PECR Sch. A1 ¶6(1)(d) conditions the appearance/functionality exception on
// the service giving "a simple means of objecting, free of charge, to the
// storage or access". The right is to object to *the storage*, not to the value,
// so a preference you can rewrite but never un-store does not satisfy it. This
// module is that means: it removes what is stored and stops the future writes.
//
// **Suppression is an interposition on `setItem`, not a guard each writer
// consults.** Two things force that. `theme` belongs to next-themes and has no
// write site in this tree at all, so there is nothing to add a guard to; and
// wrapping the one `setTheme` call site is defeated by next-themes' own
// `storage` listener, which reacts to another tab removing the key by calling
// `setTheme(defaultTheme)` and writing it straight back - a remove/rewrite
// livelock with a second tab open. An interposition catches that rewrite too,
// because it catches every write regardless of who started it. The cost is that
// it is invisible magic a future reader has to discover, which is what this
// comment, the DECISIONS entry and the classification check in
// `storage-keys.test.ts` are the fence against.
//
// **Clearing goes by prefix; suppression goes by list.** Orphaned keys sit in
// browsers that ran an older build and have no literal left in this tree: the
// two superseded dive-profile series keys from the `-v2` and `-v3` bumps, and
// the last-auth-method key from the change that deleted the sign-in hint. A
// census cannot see any of them, and naming one here as a literal would oblige
// §10 of the privacy page to give a row to a key this app no longer writes, so
// `setOptOut(true)` walks live storage instead and removes everything under the
// prefix bar the named exclusions. Suppression cannot work that way - a key has
// to be classified before it can be dropped - so the covered list is a list,
// and check (4) of `storage-keys.test.ts` is what stops a new key sitting in
// neither.
//
// `access_token` is deliberately out of reach of the prefix rule, and that is
// recorded rather than left as a gap: `lib/api/client.ts` wrote it to
// `localStorage` until the change recorded under "Access token lives in memory
// only, never in `localStorage`", and it carries no prefix. The ground for
// leaving it is population, not harm - that change predates every release and
// the project's own hosted instance, so the only browser that ever held one is
// the maintainer's own.
//
// React-free on purpose: the read/subscribe pair below is in the
// `useSyncExternalStore` shape the other storage modules use, and the one
// component that consumes it is what renders under the theme provider.

/**
 * The switch's own entry. **Presence means opted out** - the value is
 * incidental, and nothing reads it.
 */
export const DEVICE_MEMORY_OPT_OUT_KEY = "opendiving:device-memory-opt-out";

/**
 * The keys the switch removes and then refuses to store.
 *
 * `theme` is here without an `opendiving:` prefix because it is next-themes'
 * own default key, configured in `app/layout.tsx` without a `storageKey`
 * override - there is no literal for `storage-keys.test.ts` to sweep, which is
 * why check (4) asserts this one by hand.
 *
 * `opendiving:entry-units` is covered even though it already passes the
 * objection test on its own (emptying the overrides deletes the key): a switch
 * that says "don't remember display preferences" and silently skipped the unit
 * overrides would not do what it says.
 */
export const COVERED_KEYS = [
  "theme",
  "opendiving:passkey-nudge-dismissed",
  "opendiving:dive-profile-series-v3",
  "opendiving:gas-use-series",
  "opendiving:dive-activity-view",
  "opendiving:gas-use-view",
  "opendiving:entry-units",
] as const;

/**
 * The `opendiving:` keys the switch leaves alone, each for a stated reason.
 *
 * `post-auth-redirect` and `google-sign-in-attempts` are functional storage -
 * they carry a sign-in across the mail-client or Google hop - and both remove
 * themselves the moment they are read. The flag itself is the
 * consent-mechanism-storage case: an objection this browser cannot remember is
 * not an objection, and Sch. A1 ¶6(2) means the means need only be offered "in
 * respect of the initial use" rather than re-offered per key or per visit.
 */
export const EXCLUDED_KEYS = [
  "opendiving:post-auth-redirect",
  "opendiving:google-sign-in-attempts",
  DEVICE_MEMORY_OPT_OUT_KEY,
] as const;

const KEY_PREFIX = "opendiving:";

/**
 * How the switch treats a key, or `null` for one it has never heard of.
 *
 * The `null` answer is the whole point: check (4) of `storage-keys.test.ts`
 * fails on it, so a new browser-storage key cannot ship without somebody
 * deciding whether the objection switch covers it.
 */
export function deviceMemoryClass(key: string): "covered" | "excluded" | null {
  if ((COVERED_KEYS as readonly string[]).includes(key)) return "covered";
  if ((EXCLUDED_KEYS as readonly string[]).includes(key)) return "excluded";
  return null;
}

// Storage can be unavailable (Safari private mode, storage disabled), missing
// entirely under the test runner, or - on the SSR pass, since the root layout
// is a Server Component rendering client modules - reached with no `window` at
// all. The last is a `ReferenceError` rather than a storage error, which is why
// this never reads `window.localStorage` bare.
function storage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Whether this browser has objected, read live from storage.
 *
 * The snapshot half of `useSyncExternalStore`, and also what the interposition
 * consults on every write - deliberately not a boolean cached at install time,
 * because the tab that has to honour the objection is often not the tab that
 * made it.
 */
export function isOptedOut(): boolean {
  try {
    return storage()?.getItem(DEVICE_MEMORY_OPT_OUT_KEY) != null;
  } catch {
    return false;
  }
}

/** The server (and pre-hydration) answer: nothing is stored, so nothing is opted out. */
export function isOptedOutOnServer(): boolean {
  return false;
}

const listeners = new Set<() => void>();

// A `storage` event fires only in *other* documents, so this covers the second
// tab and the same-document notify below covers this one. Filtered on the key
// because the event fires for every write in every other tab, and `null` is the
// whole-store clear.
function onStorageEvent(event: StorageEvent): void {
  if (event.key === null || event.key === DEVICE_MEMORY_OPT_OUT_KEY) {
    for (const listener of listeners) listener();
  }
}

/**
 * The subscribe half of `useSyncExternalStore`.
 *
 * Genuinely subscribed, unlike `subscribeToNothing` in `chart-series-view.ts`:
 * two surfaces render this same state, so a change made on one is what the
 * other has to read.
 */
export function subscribeToOptOut(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorageEvent);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

// Every `opendiving:` key present bar the exclusions, plus the covered keys
// that carry no prefix. Collected before anything is removed, because removing
// while walking `key(i)` shifts every later index.
function keysToClear(current: Storage): string[] {
  const found = new Set<string>();

  for (let index = 0; index < current.length; index += 1) {
    const key = current.key(index);
    if (key === null) continue;
    if (!key.startsWith(KEY_PREFIX)) continue;
    if (deviceMemoryClass(key) === "excluded") continue;
    found.add(key);
  }

  // `theme` has no prefix, so the walk above cannot find it. Any future
  // literal-less covered key joins it here for free.
  for (const key of COVERED_KEYS) {
    if (!key.startsWith(KEY_PREFIX)) found.add(key);
  }

  return [...found];
}

/**
 * Turns the objection on or off.
 *
 * **On** writes the flag and then clears: `theme` plus every non-excluded
 * `opendiving:` key present. The flag goes first so that a second tab reacting
 * to the removals already sees the objection and has its rewrite dropped.
 *
 * **Off** removes the flag and restores nothing. The stored values were the
 * thing objected to, and ¶6(1)(d) is about the storage rather than the value -
 * so "off" simply lets future interactions store again.
 */
export function setOptOut(optedOut: boolean): void {
  const current = storage();

  if (current) {
    try {
      if (optedOut) {
        current.setItem(DEVICE_MEMORY_OPT_OUT_KEY, "1");
        for (const key of keysToClear(current)) current.removeItem(key);
      } else {
        current.removeItem(DEVICE_MEMORY_OPT_OUT_KEY);
      }
    } catch {
      // A browser that refuses storage refuses to remember the objection too,
      // and has nothing stored to object to. Nothing to report, and the
      // control still reflects what storage says on the next read.
    }
  }

  for (const listener of listeners) listener();
}

// Set on the replacement so a second install is a no-op while a *fresh*
// `Storage` still gets wrapped - which is not the same question, and a
// module-level "installed" boolean would answer only the first. Under the test
// runner `test/memory-storage.ts` swaps in a new stub after every test.
const INTERPOSED = Symbol.for("opendiving.device-memory.interposed");

type Interposed = Storage["setItem"] & { [INTERPOSED]?: true };

// The object along the prototype chain that actually defines `setItem`:
// `Storage.prototype` in a browser, the stub object itself under the test
// runner, whose methods are own properties. Hard-coding `Storage.prototype`
// would make the interposition invisible to every test in this repo, and the
// suppression suite would pass against an implementation that does nothing.
function definitionSiteOf(target: object, name: string): object | undefined {
  let current: object | null = target;
  while (current !== null) {
    if (Object.prototype.hasOwnProperty.call(current, name)) return current;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}

/**
 * Installs the write suppression. Idempotent, and a no-op wherever there is no
 * storage to interpose on.
 *
 * Called from the module scope of `components/device-memory-installer.tsx`, so
 * it runs when the route's client bundle loads rather than when anything
 * renders - which is what puts it ahead of the dashboard cards that write their
 * view keys from a mount effect with no interaction at all.
 */
export function installDeviceMemorySuppression(): void {
  const current = storage();
  if (!current) return;

  const owner = definitionSiteOf(current, "setItem") as
    (Storage & Record<string, unknown>) | undefined;
  if (!owner) return;

  const original = owner.setItem as Interposed;
  if (original[INTERPOSED]) return;

  const interposed: Interposed = function (
    this: Storage,
    key: string,
    value: string,
  ): void {
    // In a browser `sessionStorage` shares this prototype, so the receiver is
    // what keeps the suppression to local storage. Anything else - including a
    // detached call with no receiver at all - reaches the original untouched,
    // which is what "everything else passes through byte-identical" means.
    if (this === storage() && deviceMemoryClass(key) === "covered") {
      if (isOptedOut()) return;
    }
    original.call(this, key, value);
  };
  interposed[INTERPOSED] = true;

  owner.setItem = interposed;
}
