import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { LoadMoreTrigger } from "./load-more-trigger";

// This file exists because the interesting half of `LoadMoreTrigger` is a claim
// about the viewport, and "jsdom answers no layout question" (DECISIONS.md). The
// unit lane drives the component's button and a stubbed observer; only a real
// browser can say whether the thing ever fires on a scroll at all.
//
// No stylesheet import here, unlike the other browser tests: nothing below
// depends on a Tailwind class computing to anything, only on block elements
// stacking and the page scrolling.
//
// **The 400px `rootMargin` is deliberately not asserted, and cannot be from
// here.** Its job is to ask for the next page while the trigger is still below
// the fold, so a steady scroll never stops at a spinner - but this lane runs
// each test inside an iframe, and an implicit-root observer's expanded rect is
// clipped by every intervening scroll container, the iframe boundary included.
// Measured: with the trigger 20px below the fold, nothing fires; it fires only
// once genuinely on screen. That is the harness, not the component - the app is
// not in an iframe - and the two tests below are the part of the behaviour this
// lane can actually hold. A margin regression is invisible to the whole suite,
// so it is a browser walk that would catch one.

const SPACER = 3000;

function renderTrigger() {
  const onLoadMore = vi.fn();
  const view = render(
    <>
      <div style={{ height: `${SPACER}px` }} data-testid="spacer" />
      <LoadMoreTrigger
        hasMore
        isLoading={false}
        loadedCount={10}
        totalCount={100}
        itemsPerPage={10}
        itemLabel="dives"
        onLoadMore={onLoadMore}
      />
    </>,
  );
  return { onLoadMore, ...view };
}

beforeEach(() => {
  window.scrollTo(0, 0);
});

describe("LoadMoreTrigger in a real viewport", () => {
  it("stays quiet while the end of the list is far below the fold", async () => {
    const { onLoadMore } = renderTrigger();

    // Long enough for several frames: an observer that was going to fire has
    // had every chance to.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("fires when the reader scrolls to the end of the list", async () => {
    const { onLoadMore } = renderTrigger();

    window.scrollTo(0, document.documentElement.scrollHeight);

    await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalled());
  });
});
