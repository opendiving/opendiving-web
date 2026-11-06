import { expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ScrollArea, ScrollBar } from "./scroll-area";
import "@/app/globals.css";

it("bounds the permission list and lets a focused viewport scroll in both directions", async () => {
  render(
    <ScrollArea
      role="region"
      aria-label="Permissions"
      className="w-64"
      viewportClassName="max-h-32"
    >
      <div className="h-96 w-[40rem]">Permission details</div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>,
  );

  const region = screen.getByRole("region", { name: "Permissions" });
  const viewport = region.querySelector("[tabindex='0']");
  if (!(viewport instanceof HTMLElement))
    throw new Error("No focusable scroll viewport");

  expect(viewport.getBoundingClientRect().height).toBe(128);
  expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
  expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
  viewport.focus();
  expect(document.activeElement).toBe(viewport);
  viewport.scrollTo({ left: 100, top: 100 });
  await waitFor(() => {
    expect(viewport.scrollTop).toBe(100);
    expect(viewport.scrollLeft).toBe(100);
  });
});
