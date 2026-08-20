import type { Metadata } from "next";
import { LandingPage } from "@/components/layout/landing-page";

// A Server Component purely so it can export `metadata` - the same split
// `contact/page.tsx` uses, and the reason the page itself lives in
// `components/layout/landing-page.tsx` with the `"use client"` on it. The landing
// page gates its whole render on `useRedirectIfAuthenticated`, so it cannot be a
// Server Component itself.
//
// This is the one page in the app that is worth indexing: everything else is behind
// auth, renders client-side (the access token is in memory, so no authenticated data
// can be fetched during SSR), and has nothing to say to a crawler anyway.
export const metadata: Metadata = {
  // `absolute` opts out of the root layout's " | OpenDiving" template - this title
  // already names the product, and "OpenDiving ... | OpenDiving" reads as a bug.
  // Matches the `<h1>`, deliberately: a title that disagrees with the headline the
  // visitor then lands on is the one mismatch a search result cannot explain away.
  title: { absolute: "OpenDiving - The Ultimate Diving App" },
  description:
    "An open-source logbook for scuba divers. Log dives with gas mixtures and multiple sites, import straight from your dive computer with the full depth profile, and keep gear service history and c-cards in one place - on your own server.",
};

export default function HomePage() {
  return <LandingPage />;
}
