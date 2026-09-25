"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { AuthForm } from "@/components/auth/auth-form";
import { InviteRequestForm } from "@/components/auth/invite-request-form";
import { Fish, Anchor, ArrowRight, HardDriveDownload } from "lucide-react";

// Every claim on this page has to be true of the software as it stands, because
// the page is served by whoever is running the instance and they are the ones it
// makes a liar of. That rules out visitor counts (there is no central service to
// count), app-store badges (there are no apps), and a community feature set
// (there is no sharing yet). What is left is what the log actually does, plus
// what it deliberately doesn't - the "no mobile apps" and "still to come" lines
// below are load-bearing, not modesty.
const SOURCE_URL = "https://github.com/opendiving/opendiving-web";
const ROADMAP_URL = "https://github.com/opendiving/opendiving-web#planned";
// The product repository, not this one and not a docs directory inside it: it is the
// page that carries the pitch *and* the four install commands, so a visitor who clicked
// "run your own" lands on the thing they came for rather than on a file listing. Both
// links below share it. See "The install lives in the product repository" in DECISIONS.md.
const SELF_HOSTING_URL = "https://github.com/opendiving/opendiving";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();
  // Under the same gate as the auth bootstrap below, and that is the point: the
  // hero must never paint one form and then swap it for the other, nor one voice
  // and then the other. Both requests start on mount and run in parallel, so
  // waiting for this one costs nothing the auth check was not already costing.
  const { config, isLoading: isConfigLoading } = useInstanceConfig();

  if (isLoading || isAuthenticated || isConfigLoading) {
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
        <div
          aria-hidden="true"
          className="hero-reef pointer-events-none absolute top-12 left-[48%] hidden w-[280px] -translate-x-1/2 opacity-25 lg:block"
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="text-center">
              {/* The page's `<h1>`. It was an `<h2>` while the header wordmark
                  held the `<h1>`, which left the landing page - the one page
                  search engines actually index - with no top-level heading at
                  all. Styling is unchanged. */}
              {/* "The Ultimate Diving App" is the owner's call and the one
                  superlative on a page otherwise held to checkable claims -
                  kept for now, deliberately, not overlooked. See "The landing
                  page can only claim what the instance can back up" in
                  DECISIONS.md before rewording it in either direction. */}
              <h1 className="text-4xl md:text-6xl font-extrabold uppercase tracking-tight text-foreground mb-6 leading-tight">
                The Ultimate
                <br />
                <span className="text-coral text-[0.8em]">Diving App</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                An open-source logbook for scuba divers, recreational and
                technical. Nitrox and trimix mixes, dives imported straight from
                your computer with the full profile, gear and c-cards alongside
                them — and an export button that hands the lot back in open
                formats, which this app will read straight back in.
              </p>
            </div>

            {/* Which form the hero holds is the one thing on this page that
                depends on the instance. In `invite` mode there is nothing a
                stranger can do with a sign-in form, so the column holds the
                request form instead; every other route in - the header's Sign in
                button, "Sign in to this instance" below, and the link inside the
                request form - still reaches `/signin`, which is unchanged in both
                modes.

                An unknown config renders the sign-in form. A landing page has
                to work on an instance whose API is briefly down, and `/signin`
                is the answer that is right on any instance; it is also what the
                axe scan sees, since that job runs the web with no API at all.

                Which voice the request form speaks in is the second thing here
                that depends on the instance, and the only copy in the app that
                knows who runs it. `project_operated: true` means the OpenDiving
                project operates this copy, and the form invites the visitor onto
                a waitlist in the project's own voice. Anything else - `false`,
                or a `/config` from an API that predates the field - gets the
                generic copy, which is true of every instance; with no `/config`
                at all the question never arises, since the sign-in form is what
                an unknown config renders, as above. The asymmetry is the rule:
                a self-hoster's hero must never say "we'll notify you" on the
                project's behalf, so nothing short of the API answering `true`
                earns that voice. It picks copy and only copy - the mode alone
                decides which form is here.

                What the swap costs, accepted deliberately: `AuthForm` is the only
                mount of the conditional passkey ceremony and of the passkey and
                Google buttons, so in `invite` mode the landing page arms none of
                them. A returning member takes Sign in and has all three on
                `/signin`, one tap away. */}
            <div className="flex justify-center">
              {config?.registration_mode === "invite" ? (
                <InviteRequestForm
                  variant={
                    config.project_operated === true ? "waitlist" : "generic"
                  }
                />
              ) : (
                <AuthForm />
              )}
            </div>
          </div>

          {/* Prose, not the pair of buttons that first replaced the store
              badges. Most divers arriving here are signing in to a log, not
              shopping for something to deploy - two large self-hosting CTAs
              directly under the form sold the hero to the smaller audience.
              The badges still have to be answered for, so the missing apps are
              stated outright; the links now sit inline at the weight they
              deserve, and the prominent one lives in "Run your own" below. */}
          <p className="mt-16 mx-auto max-w-xl text-center text-sm text-muted-foreground">
            There are no mobile apps — the iOS companion is parked until the
            server side is finished, and this web app is built to work on a
            phone in the meantime. The{" "}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              source
            </a>{" "}
            is on GitHub, and you can{" "}
            <a
              href={SELF_HOSTING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              run your own instance
            </a>
            .
          </p>
        </div>
      </section>

      {/* Features Section */}
      {/* `scroll-mt-20` because this is the one anchored section with no top
          padding of its own - `pb-20` only, since the hero's `py-20` already
          spaces the cards on a normal scroll through. That is fine until you
          jump straight here from the nav, where `--header-height` alone lands
          the cards' top edge flush against the header. The 80px it adds is the
          same 5rem the other sections give their content, so all three anchors
          come to rest with matching clearance.

          Safe here specifically because what sits above is the hero, on the
          same `bg-background`: the exposed band is invisible. Do NOT copy this
          onto `#self-hosting` - above that one is the full-bleed `bg-primary`
          band, and offsetting it is what put a black strip under the header.
          See the `scroll-padding-top` note in `globals.css`. */}
      <section id="features" className="scroll-mt-20 pb-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* `sr-only` rather than absent: the cards below are the page's second
              section and need a heading to sit under, but the design has never
              shown one and the cards' own titles carry it visually. */}
          <h2 className="sr-only">What OpenDiving does</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Fish className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Dive Log</CardTitle>
                <CardDescription>
                  Depths, times, gas, and what you saw down there
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Nitrox and trimix mixes, with MOD, END and EAD</li>
                  <li>• Several dive sites on one dive, in order</li>
                  <li>• Marine life, against a real species catalog</li>
                  <li>• SAC and RMV derived per tank</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <HardDriveDownload className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Computer Import</CardTitle>
                <CardDescription>
                  Upload the export, keep every original file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• FIT files from Garmin Descent and Suunto</li>
                  <li>• Suunto XML and JSON exports</li>
                  <li>
                    • Full depth, temperature and pressure profile, with the
                    computer&rsquo;s own deco readouts
                  </li>
                  <li>
                    • Every file you upload stays with its recording, and stays
                    downloadable
                  </li>
                  <li>
                    • Two computers on one dive, or two logs of one — merged
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Anchor className="h-12 w-12 text-teal mb-4" />
                <CardTitle>Yours To Keep</CardTitle>
                {/* "self-hostable", not "self-hosted": this card renders on
                    every instance, and most visitors are signing in to a log
                    somebody else runs. The capability is the promise; the
                    deployment is not theirs to be told about. See
                    "Self-hosting is a capability, not the product's identity"
                    in DECISIONS.md. */}
                <CardDescription>
                  Open source, self-hostable, and exportable in one click
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• AGPL-3.0, server side included</li>
                  <li>
                    • DiveJSON, UDDF, CSV or a complete archive, on demand
                  </li>
                  {/* The half that makes the export more than a download: a copy
                      you cannot read back is a copy in name only. The list is
                      what the API's converter reads plus this app's own two,
                      and it is spelled out rather than summarised because the
                      claim a diver is checking is whether *their* file is on
                      it. */}
                  <li>
                    • DiveJSON, UDDF, Subsurface, FIT, Suunto&apos;s app and DM5
                    exports, and the full archive read back in
                  </li>
                  <li>• No trackers and no analytics</li>
                  <li>• Passwordless sign-in; no passwords stored</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <p className="mt-8 max-w-3xl mx-auto text-center text-muted-foreground">
            Dives group into trips and into the courses they were part of, the
            dive centers and places you stayed are kept once and picked from a
            list, gear carries its own service schedule with due-soon reminders,
            and your c-cards sit alongside them &mdash; on one page with the
            details a dive shop asks for, to print and hand over at the desk.
          </p>
        </div>
      </section>

      {/* Why Section - this band held four invented headline figures
          ("1,000+ Active Divers" and friends) for a product with no central
          service to count anything. It now carries the argument those numbers
          were standing in for. */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">
            Built to outlive the vendor
          </h2>
          <p className="text-lg">
            Movescount, Deepblu, Diveboard — cloud dive logs come and go, and
            when they go, years of dive history go with them. OpenDiving keeps
            every dive-computer file you upload alongside the recording it came
            from, hands the whole log back in open formats on one click, reads a
            logbook back in — its own DiveJSON, UDDF, a Subsurface save file, a
            FIT, or a Suunto app or DM5 export — and is AGPL licensed so anyone
            can keep running it. There is no company here whose shutdown takes
            your logbook with it — and if the instance you are on ever goes
            away, your export still opens in something else, or moves into a
            copy of this one.
          </p>
          <div className="mt-10 grid gap-4 text-sm font-medium sm:grid-cols-3">
            <div>AGPL-3.0, server side included</div>
            <div>No trackers, no analytics</div>
            {/* Four formats out, and still deliberately not "and back": three of
                the four come back now, but a round-trip claim spanning all four
                would be false of the CSV. The paragraph above carries the import
                half, naming the formats it is actually true of.

                This comment read "only DiveJSON and the archive import … false
                of UDDF and CSV" until the API grew a converter, which is the
                hazard it exists to describe happening to itself: a claim about
                what one format cannot do is a claim about every other one. */}
            <div>DiveJSON, UDDF, CSV or a full archive, one click</div>
          </div>
        </div>
      </section>

      {/* Self-hosting Section */}
      <section id="self-hosting" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-6">
            Run your own
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            One compose file brings up the whole stack — this app, the API and
            its worker, Postgres, Redis, and a Caddy that provisions TLS for
            your domain. The images are prebuilt for amd64 and arm64, so a
            Raspberry Pi runs the same bytes as a VPS.
          </p>
          {/* The import clause is gone because both importers it named shipped
              together: the API reads UDDF and Subsurface from the day its
              converter landed, so there was never a state in which one of the
              two was still to come. That is the only way this line was ever
              allowed to narrow - by shipping, never by softening - and the
              standing rule holds for what is left of it. */}
          <p className="text-muted-foreground mb-8">
            Still to come: depth and time statistics, and public links for a
            dive or a trip. The{" "}
            <a
              href={ROADMAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              roadmap
            </a>{" "}
            says what is built and what is not, and contributions are welcome.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a
                href={SELF_HOSTING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                How to self-host
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
            {/* `/signin`, not the `#get-started` anchor back up the page: it is
                where the header's own Sign in button goes, and a dedicated page
                is a better answer this far down than a scroll that lands the
                visitor on a hero they have already read past. */}
            <Button asChild size="lg" variant="outline">
              <Link href="/signin">Sign in to this instance</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
