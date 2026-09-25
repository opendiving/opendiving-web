import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportForm } from "@/components/support/support-form";
import { ISSUE_TRACKERS } from "@/lib/support";
import { runtimeConfig } from "@/lib/runtime-config";
import Link from "next/link";
import { Metadata } from "next";
import { AlertCircle, Anchor, Bug, Heart, Mail, Shield } from "lucide-react";

export const metadata: Metadata = {
  // The root layout's `title.template` appends " | OpenDiving".
  title: "Support",
  description:
    "Get support from the people who build OpenDiving - report a bug, request a feature, or send a message that reaches a real inbox.",
};

export default function SupportPage() {
  // Display-only, and deliberately without a default: this can't route mail on its own -
  // the API's `CONTACT_FORM_EMAIL` decides where a submission actually goes - so
  // defaulting it to the project's own address would hand a self-hosted instance's
  // visitors an address that reaches people who can't help them. Left unset, a failed
  // submission points at the issue tracker instead, which is right for every deployment.
  const { contactEmail } = runtimeConfig();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">Support</h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          OpenDiving is an open-source dive log built by volunteers. The form
          below reaches a real inbox, and most things get fixed faster in the
          open, on GitHub.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              {/* Only the two semantic icons below are coloured. `text-primary`
                  used to be on the other three, and is a mid-grey in dark mode
                  (see DECISIONS.md) - dimmer there than the description under
                  it, and indistinguishable from the title in light mode. */}
              <CardTitle as="h2" className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Bugs & feature requests
              </CardTitle>
              <CardDescription>
                Public, searchable, and where the work happens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-foreground">
                Check whether someone has already reported it, then open an
                issue on whichever part broke:
              </p>
              <div className="flex flex-wrap gap-2">
                {ISSUE_TRACKERS.map(({ label, href }) => (
                  <Button key={href} asChild variant="outline" size="sm">
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-success" />
                Security
              </CardTitle>
              <CardDescription>Report it privately first</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">
                Found something that exposes other divers&apos; data? Use the
                form with the <strong>Security</strong> category rather than the
                issue tracker, so it can be fixed before it is public.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-destructive" />
                Contributing
              </CardTitle>
              <CardDescription>Code, docs, or a new parser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-foreground">
                Support for a dive computer we cannot read yet is the single
                most useful thing you can add. The contributing guide covers
                setup and how a parser fits in.
              </p>
              <Button asChild variant="outline" className="w-full">
                <a
                  href="https://github.com/opendiving/opendiving-web/blob/main/CONTRIBUTING.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contributing guide
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Anchor className="h-5 w-5" />
                Self-hosted instances
              </CardTitle>
              <CardDescription>Your server, your data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-foreground">
                If you run your own instance, your dives live in your database -
                we cannot see them, restore them, or reset an account on it.
                Whoever operates that server is the one who can.
              </p>
              {/* The product repository. This used to be an `#quickstart`
                  anchor on the API repo's README, which has no heading of that
                  name and never had one - so the button landed at the top of a
                  component's README either way. The install is a product-level
                  thing and now lives where it is written. */}
              <Button asChild variant="outline" className="w-full">
                <a
                  href="https://github.com/opendiving/opendiving"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Self-hosting quickstart
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Send us a message
              </CardTitle>
              <CardDescription>
                For anything that does not belong in a public issue - or when
                you would rather just write to a person.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SupportForm fallbackEmail={contactEmail} />

              <div className="rounded-md border bg-muted p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    <strong>
                      This is a logbook, not an emergency service.
                    </strong>{" "}
                    For a diving accident or suspected decompression illness,
                    call your local emergency number and your regional diving
                    emergency hotline - not us. Nothing in OpenDiving, including
                    its gas and service calculations, is a substitute for your
                    training, your tables, or your dive computer.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-12 text-center text-muted-foreground">
        <p>
          Everyone here is a volunteer diving in their own time, so replies take
          a few days. Anything you send is used only to answer you - see the{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            privacy policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            terms
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
