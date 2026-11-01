import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster } from "./toaster";
import { toast, useToast } from "./use-toast";
import { renderHook } from "@testing-library/react";

afterEach(() => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.dismiss());
});

describe("Toaster", () => {
  it("renders a notification raised before the viewport mounts", async () => {
    toast({ description: "Dive saved before mount" });
    render(<Toaster />);
    expect(await screen.findByText("Dive saved before mount")).toBeVisible();
  });

  it("dismisses a notification with its close button", async () => {
    render(<Toaster />);
    act(() => {
      toast({ description: "Dismiss this notification" });
    });
    await screen.findByText("Dismiss this notification");
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Dismiss this notification"),
      ).not.toBeInTheDocument(),
    );
  });

  it("updates a notification in place", async () => {
    render(<Toaster />);
    const handle = toast({ description: "Uploading dive" });
    await screen.findByText("Uploading dive");
    act(() => handle.update({ id: handle.id, description: "Upload finished" }));
    expect(await screen.findByText("Upload finished")).toBeVisible();
    expect(screen.queryByText("Uploading dive")).not.toBeInTheDocument();
  });
});
