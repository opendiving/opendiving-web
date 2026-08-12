"use client";

import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { AuthForm } from "@/components/auth/auth-form";
import { Fish, Anchor, ArrowRight, Users } from "lucide-react";
import { AppleLogo } from "@/components/icons/apple-logo";
import { GooglePlayLogo } from "@/components/icons/google-play-logo";
import { CoralReefBackground } from "@/components/icons/coral-reef-background";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background">
      {/* Hero Section */}
      <section id="get-started" className="relative overflow-x-hidden py-20">
        <CoralReefBackground className="pointer-events-none absolute top-40 left-[48%] hidden h-auto w-60 -translate-x-1/2 text-teal opacity-25 lg:block" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="text-center">
              {/* The page's `<h1>`. It was an `<h2>` while the header wordmark
                  held the `<h1>`, which left the landing page - the one page
                  search engines actually index - with no top-level heading at
                  all. Styling is unchanged. */}
              <h1 className="text-4xl md:text-6xl font-extrabold uppercase tracking-tight text-foreground mb-6 leading-tight">
                The Ultimate
                <br />
                <span className="text-coral-text text-[0.8em]">Diving App</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Join the global diving community. Track your dives, share
                experiences, and explore the underwater world with fellow divers
                around the world.
              </p>
            </div>

            <div className="flex justify-center">
              <AuthForm />
            </div>
          </div>

          <div className="mt-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#"
              className="inline-flex h-13 items-center gap-2.5 rounded-xl bg-foreground px-4 text-background transition-opacity hover:opacity-90"
            >
              <AppleLogo className="h-8 w-8 shrink-0" />
              <span className="flex flex-col leading-none">
                <span className="text-[11px] leading-none">
                  Download on the
                </span>
                <span className="mt-0.5 text-2xl font-semibold leading-none tracking-tight">
                  App Store
                </span>
              </span>
            </a>
            <a
              href="#"
              className="inline-flex h-13 items-center gap-2.5 rounded-xl bg-foreground px-4 text-background transition-opacity hover:opacity-90"
            >
              <GooglePlayLogo className="h-8 w-8 shrink-0" />
              <span className="flex flex-col leading-none">
                <span className="text-[11px] leading-none tracking-wide">
                  GET IT ON
                </span>
                <span className="mt-0.5 text-2xl font-semibold leading-none tracking-tight">
                  Google Play
                </span>
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="pb-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Fish className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Dive Log</CardTitle>
                <CardDescription>
                  Track your underwater adventures with detailed dive logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Import data from dive computers</li>
                  <li>• Marine life observations</li>
                  <li>• Equipment management</li>
                  <li>• Diving statistics at a glance</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Community</CardTitle>
                <CardDescription>
                  Connect with divers worldwide and share experiences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Share dive photos</li>
                  <li>• Find dive buddies</li>
                  <li>• Local dive sites</li>
                  <li>• Safety tips & advice</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Anchor className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Open Source</CardTitle>
                <CardDescription>
                  Built by divers, for divers, completely open source and free
                  forever
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Transparent development</li>
                  <li>• Community contributions</li>
                  <li>• Data ownership</li>
                  <li>• Privacy focused</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">1,000+</div>
              <div className="text-primary-foreground">Active Divers</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">5,000+</div>
              <div className="text-primary-foreground">Logged Dives</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">50+</div>
              <div className="text-primary-foreground">Countries</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">100%</div>
              <div className="text-primary-foreground">Open Source</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="community" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-3xl font-bold text-foreground mb-6">
            Ready to Dive In?
          </h3>
          <p className="text-lg text-muted-foreground mb-8">
            Join thousands of divers who are already using OpenDiving to track
            their underwater adventures and connect with the global diving
            community.
          </p>
          <a
            href="#get-started"
            className="inline-flex items-center justify-center rounded-md bg-teal-solid px-8 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-teal-solid/90"
          >
            Get Started - It's Free
            <ArrowRight className="h-4 w-4 ml-2" />
          </a>
        </div>
      </section>
    </div>
  );
}
