import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { announceSignedOut, onSignedOutElsewhere } from "./auth-broadcast";

// Another tab, as far as the module can tell: a second instance of the same name.
let otherTab: BroadcastChannel | undefined;
afterEach(() => otherTab?.close());

const settle = () => new Promise((done) => setTimeout(done, 20));

describe("the sign-out broadcast", () => {
  it("reaches another tab", async () => {
    otherTab = new BroadcastChannel("auth");
    const heard = vi.fn();
    otherTab.onmessage = (event) => heard(event.data);

    announceSignedOut();

    await waitFor(() => expect(heard).toHaveBeenCalledWith("signed-out"));
  });

  it("is heard from another tab, until the listener unsubscribes", async () => {
    otherTab = new BroadcastChannel("auth");
    const listener = vi.fn();
    const unsubscribe = onSignedOutElsewhere(listener);

    otherTab.postMessage("something else");
    otherTab.postMessage("signed-out");
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    unsubscribe();
    otherTab.postMessage("signed-out");
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // The tab that deleted the account is leaving for `/goodbye`; hearing its own
  // message would send it to `/` instead, whichever navigation won.
  it("is not heard by the tab that sent it", async () => {
    const listener = vi.fn();
    const unsubscribe = onSignedOutElsewhere(listener);

    announceSignedOut();
    await settle();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
