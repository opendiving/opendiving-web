import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Toaster } from "./toaster";
import { toast, useToast } from "./use-toast";
import "@/app/globals.css";

afterEach(() => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.dismiss());
});

describe("notification placement", () => {
  for (const width of [393, 1024]) {
    it(`shows readable, dismissible notifications at ${width}px`, async () => {
      await page.viewport(width, 800);
      render(<Toaster />);
      act(() => {
        toast({
          title: "Dive saved",
          description: "Your logbook is up to date.",
          variant: "destructive",
        });
      });
      const description = await screen.findByText(
        "Your logbook is up to date.",
      );
      await waitFor(() => {
        const box = description.getBoundingClientRect();
        expect(box.height).toBeGreaterThan(10);
        expect(box.width).toBeGreaterThan(100);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(800);
        if (width < 640) expect(box.top).toBeLessThan(200);
        else expect(box.top).toBeGreaterThan(600);
      });
      await page.getByRole("button", { name: "Dismiss notification" }).click();
      await waitFor(() => expect(description).not.toBeInTheDocument());
    });
  }
});
