import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { reveal } from "@/test/intersection";
import { LoadMoreTrigger } from "./load-more-trigger";

function setup(props: Partial<Parameters<typeof LoadMoreTrigger>[0]> = {}) {
  const onLoadMore = vi.fn();
  const result = render(
    <LoadMoreTrigger
      hasMore
      isLoading={false}
      loadedCount={10}
      totalCount={30}
      itemsPerPage={10}
      itemLabel="dives"
      onLoadMore={onLoadMore}
      {...props}
    />,
  );
  return { onLoadMore, ...result };
}

describe("LoadMoreTrigger", () => {
  it("says how much of the list is on screen", () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 10 of 30 dives",
    );
  });

  // The status line is a live region because appended rows are otherwise a
  // silent change - there is no focus move and no navigation to announce.
  it("announces the end of the list rather than going quiet", () => {
    setup({ hasMore: false, loadedCount: 30 });

    expect(screen.getByRole("status")).toHaveTextContent("All 30 dives loaded");
    expect(
      screen.queryByRole("button", { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for a list that fits on one page", () => {
    const { container } = setup({
      hasMore: false,
      loadedCount: 7,
      totalCount: 7,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty list", () => {
    const { container } = setup({
      hasMore: false,
      loadedCount: 0,
      totalCount: 0,
    });
    expect(container).toBeEmptyDOMElement();
  });

  // The half of this component that a mouse never uses, and the reason the
  // sentinel is a button rather than a bare <div>: auto-load on scroll is
  // unreachable by keyboard and invisible to a screen reader.
  it("loads more when the button is activated", async () => {
    const user = userEvent.setup();
    const { onLoadMore } = setup();

    await user.click(screen.getByRole("button", { name: "Load more dives" }));

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("loads more when the trigger scrolls into view", async () => {
    const { onLoadMore } = setup();

    await act(async () => reveal());

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("asks for nothing more once the list is exhausted", async () => {
    const { onLoadMore } = setup({ hasMore: false, loadedCount: 30 });

    await act(async () => reveal());

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  // Two reasons: the request is already running, and the button says so where
  // the spinner has replaced its label.
  it("does not fire again while a page is in flight", async () => {
    const user = userEvent.setup();
    const { onLoadMore } = setup({ isLoading: true });

    await act(async () => reveal());
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  // A page that lands without pushing the button back off screen - a short
  // page, or a tall viewport - has to pull the next one straight after it,
  // rather than stalling until the reader scrolls again.
  it("keeps going while the trigger stays on screen", async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <LoadMoreTrigger
        hasMore
        isLoading={false}
        loadedCount={10}
        totalCount={100}
        itemsPerPage={10}
        itemLabel="dives"
        onLoadMore={onLoadMore}
      />,
    );

    await act(async () => reveal());
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const props = {
      hasMore: true,
      totalCount: 100,
      itemsPerPage: 10,
      itemLabel: "dives",
      onLoadMore,
    };
    rerender(<LoadMoreTrigger {...props} isLoading={true} loadedCount={10} />);
    rerender(<LoadMoreTrigger {...props} isLoading={false} loadedCount={20} />);

    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
