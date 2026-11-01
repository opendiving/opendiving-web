import { describe, expect, it, vi } from "vitest";

// Only `generateMetadata` is under test; the fonts and the client tree the layout
// renders have no part in it.
vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "" }),
  Outfit: () => ({ variable: "" }),
}));
vi.mock("@/contexts/AuthContext", () => ({ AuthProvider: () => null }));
vi.mock("@/contexts/CheckinDetailsContext", () => ({
  CheckinDetailsProvider: () => null,
}));
vi.mock("@/contexts/ConfigContext", () => ({ ConfigProvider: () => null }));
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: () => null }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/components/nonce-provider", () => ({ NonceProvider: () => null }));
vi.mock("@/components/device-memory-installer", () => ({
  DeviceMemoryInstaller: () => null,
}));

const { generateMetadata } = await import("./layout");

// Next fills an `openGraph` that has no title or description from the page's own
// metadata, so whatever the root sets here is what every page that sets none previews
// as.
describe("the root layout's link preview", () => {
  it("leaves each page's title and description to the page", () => {
    const { openGraph } = generateMetadata();

    expect(openGraph).not.toHaveProperty("title");
    expect(openGraph).not.toHaveProperty("description");
  });

  it("names no URL, so a preview is of the address that was shared", () => {
    expect(generateMetadata().openGraph).not.toHaveProperty("url");
  });

  it("asks for the small card, having no image for a large one", () => {
    expect(generateMetadata().twitter).toEqual({ card: "summary" });
  });
});
