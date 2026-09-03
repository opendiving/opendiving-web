import Link from "next/link";
import { Metadata } from "next";
import { runtimeConfig } from "@/lib/runtime-config";
import { DeviceMemorySwitch } from "@/components/device-memory-switch";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What this copy of OpenDiving collects, what it stores in your browser, and who is responsible for it.",
};

// The storage keys in §10 are written out as literal strings on purpose:
// `src/lib/storage-keys.test.ts` asserts that every `opendiving:`-prefixed key
// defined anywhere in production code appears verbatim in this file, so a new key
// that nobody disclosed fails the build rather than shipping quietly.
function StorageKey({ name }: { name: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
      {name}
    </code>
  );
}

// This page is a Server Component and stays one; §10.3's switch is its only
// client island. The island renders a stable server-side state and resolves the
// real one after hydration, which is what every storage consumer here does.
export default function PrivacyPage() {
  // Read here rather than in a client component for the reason `/contact` reads it
  // here: this is a Server Component, so the instance's configuration is legible
  // without shipping it to the browser. The Google section below exists only where
  // an instance has Google sign-in turned on.
  const { googleClientId } = runtimeConfig();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-card rounded-lg shadow-sm p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: August 2026</p>
        </div>

        <div className="prose max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Introduction
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is open-source software for logging dives. Anyone can
              download it and run their own copy, and this page describes{" "}
              <strong>this</strong> copy &mdash; the one you are reading it on.
            </p>
            <p className="text-foreground mb-4">
              So &ldquo;we&rdquo; and &ldquo;our servers&rdquo; on this page
              mean whoever runs this copy of OpenDiving. Writing the software
              and running a copy of it are two roles rather than necessarily two
              parties: the OpenDiving project is the author of the software
              always, and is an operator only of the copies it runs itself.
              Authorship on its own carries nothing across &mdash; for a copy
              the project does not run, it runs no servers for that copy,
              receives no data from it, and never sees what you log there. Where
              the project does run a copy, it is that copy&rsquo;s operator as
              well, and every commitment this page makes of the operator is one
              it makes in that role, exactly as any other operator does. Under
              data-protection law the operator of this copy is the controller of
              your data, and they are who is answerable for it.
            </p>
            <p className="text-foreground mb-4">
              Because the software is public, so is every claim on this page.
              What it says is collected is what the source code collects, and
              you are free to go and check.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. Information We Collect
            </h2>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              2.1 Information You Provide Directly
            </h3>
            <p className="text-foreground mb-4">
              When you create an account or use the Service, you may provide:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Account Information:</strong> Name, username, email
                address. There is no password &mdash; see section 5
              </li>
              <li>
                <strong>Profile Information:</strong> Diving certifications,
                including any images or PDFs of the cards themselves, the
                training courses behind them, and a profile picture
              </li>
              <li>
                <strong>Dive Logs:</strong> Dive location, depth, duration,
                conditions, gas mixes, species seen, and your notes
              </li>
              <li>
                <strong>Dive-Computer Files:</strong> When you import a dive
                from a dive computer, the exported file itself is kept alongside
                the dive &mdash; one per dive, under the filename it arrived
                with
              </li>
              <li>
                <strong>Equipment Data:</strong> Diving equipment details and
                service records
              </li>
              <li>
                <strong>Contact Messages:</strong> Whatever you write on the
                contact page, if this copy has one configured, and the address
                you give to reply to
              </li>
            </ul>
            <p className="text-foreground mb-4">
              One thing arrives without you typing it. If you create your
              account by signing in with Google, your Google profile picture is
              fetched by this server and stored here as your avatar &mdash;
              once, when the account is made, and never again afterwards. That
              only happens on instances with Google sign-in turned on; section
              4.9 describes it if this one does.
            </p>
            <p className="text-foreground mb-4">
              Two more addresses can reach this copy before any account exists,
              and both belong to whoever is running it rather than to a
              directory of any kind. If this copy is not taking new accounts on
              its own, its home page offers a form for{" "}
              <strong>asking to be invited</strong>: the address you type there
              is stored while the request is pending, for up to 90 days, or
              until whoever runs this copy invites you or removes the request.
              Being invited does not erase it &mdash; it becomes an{" "}
              <strong>invitation</strong> instead, which records the address
              invited, the account that sent it, and whether it has been used,
              and is what lets you create an account here. Section 4.8 is about
              both, and section 7 says how long each is kept.
            </p>
            <p className="text-foreground mb-4">
              There are no photos of dives, no bio, no experience level, and no
              messages, comments or posts, because there are no community
              features to put them in.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              2.2 Automatically Collected Information
            </h3>
            <p className="text-foreground mb-4">
              Five things are recorded without you asking for them, and all five
              are ordinary machinery rather than measurement:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Server logs:</strong> Your IP address and browser user
                agent, written by the web server the way every web server writes
                them. How long <em>those</em> are kept, and whether they are
                kept at all, is a question about the operator&rsquo;s deployment
                rather than about this software. The next two entries are a
                different matter: there the app stores the same two facts
                itself, in its own database, and section 7 says for how long
              </li>
              <li>
                <strong>Signed-in devices:</strong> Each time you sign in, this
                copy writes down the session &mdash; the IP address the sign-in
                came from, your browser&rsquo;s user agent as it sent it, and
                when the session was made and last used. That record is what
                makes the list in Settings possible, and it is the only reason
                signing another device out can work at all. It holds nothing
                from the sign-in cookie itself
              </li>
              <li>
                <strong>Account security events:</strong> A record of things
                that happen to accounts on this copy, and this is the whole list
                &mdash; a sign-in link requested; an invitation asked for; an
                invitation sent; a sign-in succeeding, or a sign-in code got
                wrong; a verified sign-in being offered a new account to make,
                or a deleted one to bring back; an account created or restored;
                a second way of signing in attached to an existing account; a
                passkey added or removed; a passkey reporting a use count that
                suggests it has been copied; an email address change asked for
                or completed; an account asked to be deleted; a sign-out; one
                device signed out, or every other one at once; and a spent
                sign-in cookie turning up again. Each entry holds what happened
                and when, the IP address and user agent it came from, which way
                of signing in it was about &mdash; email, Google or a passkey
                &mdash; where that applies, and the account it was about, or,
                for something that happened before any account existed, the
                email address that was typed. An invitation sent is the one
                entry that carries both, because both are the point of it: the
                account that sent the invitation, and the address it went to.
                Never a link, a code or a token itself, only the fact that one
                was issued or used. Nothing in the app shows these to you; they
                are there for whoever runs this copy to look into a break-in or
                a burst of sign-in attempts, and section 6.2 says what that
                means for asking for a copy
              </li>
              <li>
                <strong>Rate-limit counters:</strong> To stop sign-in, the
                contact form and the invite-request form being hammered, this
                server counts recent requests in a short-lived store. The
                counters are keyed three ways &mdash; by IP address, by the
                email address a sign-in link, a contact message or an invitation
                was requested for, and by account id for things you can only do
                signed in, such as exporting your data, changing your username
                or email, registering a passkey, inviting somebody, and looking
                up place and species names. Each counter is a number and expires
                by itself: after 15 minutes on the sign-in and account paths,
                after an hour on the contact form, the invite-request form,
                exports, and the place- and species-name lookups. Other counters
                exist that hold no identifier at all &mdash; they cap how often
                this server as a whole may call an outside provider, and are
                keyed on the provider, not on anyone
              </li>
              <li>
                <strong>Passkey labels:</strong> If you register a passkey, a
                coarse label worked out from your browser &mdash; something like
                &ldquo;Chrome on macOS&rdquo; &mdash; is saved with it, so a
                list of passkeys tells you which is which
              </li>
            </ul>
            <p className="text-foreground mb-4">
              What is kept in your browser is a separate matter, and section 10
              lists all of it. No usage data is collected: nothing here measures
              which pages you visit, which dives you open, or how long you
              spend, and none of the five above is counted, compared or
              profiled. The security record names things that happened to your
              account &mdash; not what you were doing in the app.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              2.3 Location Information
            </h3>
            <p className="text-foreground mb-4">
              Location reaches this server two ways, and both start with you:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Coordinates you place yourself &mdash; a pin on the map, or a
                pair of coordinates typed into a dive site or trip form
              </li>
              <li>
                GPS positions recorded inside a dive-computer file you import,
                which are where you actually were rather than which site you
                picked
              </li>
            </ul>
            <p className="text-foreground mb-4">
              The app never asks your browser where you are. That is not a
              promise about restraint: the page is served with a header that
              switches the browser&rsquo;s geolocation feature off outright, so
              the question cannot be asked even by mistake. What the basemap
              provider sees when a map is on screen is a different question, and
              section 4.4 answers it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-foreground mb-4">We use your information to:</p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Provide the Service:</strong> Store your dives, sites,
                trips, gear, courses and certifications, and show them back to
                you
              </li>
              <li>
                <strong>Account Management:</strong> Sign you in, keep you
                signed in, and let you change or delete your account
              </li>
              <li>
                <strong>Email:</strong> Send you a sign-in link and code,
                confirm an address change, confirm a deletion, tell an address
                that it has been invited here, tell you when a passkey is added
                to or removed from your account, tell your old address when your
                email address is changed, and &mdash; if you have set a service
                schedule on a piece of gear &mdash; remind you when it comes
                due. If you use the contact form, deliver what you wrote to
                whoever runs this copy. Section 6.3 lists all of these and says
                which arrive without you asking
              </li>
              <li>
                <strong>Decide who may create an account:</strong> Where this
                copy is invite-only, keep its invitations and the requests
                waiting on them, so that the address that was invited is the one
                that gets in, and so that whoever runs this copy can see who has
                asked. Section 4.8 says what that shows to whom, and section 7
                how long either is kept
              </li>
              <li>
                <strong>Keep the instance standing:</strong> Apply the rate
                limits described in section 2.2
              </li>
              <li>
                <strong>Keep your account secure:</strong> Keep the record of
                signed-in devices from section 2.2, so you can see them and sign
                one out, and keep the record of account security events, so
                whoever runs this copy can look into a break-in or a burst of
                sign-in attempts. Both expire on a schedule &mdash; section 7
              </li>
            </ul>
            <p className="text-foreground mb-4">
              And nothing else. Your data is not profiled, not used to
              personalise anything, not used to pick content for you, not sold,
              and not fed to advertising. There is no advertising here to feed.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              4. Information Sharing and Disclosure
            </h2>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.1 Nothing Here Is Public
            </h3>
            <p className="text-foreground mb-4">
              Nothing you enter is published. There are no public profiles, no
              public dive logs, no feeds, no forums, and no ratings or reviews.
              Every dive, dive site, trip, gear item, course and certification
              belongs to one account and is visible to that account alone. There
              is no setting that makes any of it public, because there is
              nothing for such a setting to do.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.2 What Other Divers Can See
            </h3>
            <p className="text-foreground mb-4">
              Nothing you have entered is shared between accounts, and there is
              no way to make it so. There are no dive buddies, no groups, no
              comments, and no shared logs. Another diver with an account on
              this same copy cannot see any dive, dive site, trip, gear item,
              course or certification of yours.
            </p>
            <p className="text-foreground mb-4">
              There is one exception and it is not about anything you entered:
              inviting somebody shows them your name, and shows you whether they
              went on to register. Section 4.8 sets out exactly what that
              discloses, in both directions.
            </p>
            <p className="text-foreground mb-4">
              The one thing every account on this copy does draw on is the
              catalogue of species &mdash; the fish themselves, saved here once
              and belonging to no one diver. It records what a species is, never
              who saw it; section 4.6 explains how it fills up.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.3 Hosting and Email
            </h3>
            <p className="text-foreground mb-4">
              This copy of OpenDiving runs wherever its operator put it &mdash;
              their own hardware, or a hosting provider of their choosing. That
              provider necessarily holds the machine your data sits on, and
              which provider it is, if any, is the operator&rsquo;s decision
              rather than the software&rsquo;s.
            </p>
            <p className="text-foreground mb-4">
              Email reaches you through whatever mail server the operator
              configured, so that server handles the address a sign-in link or a
              reminder is sent to. There is no customer support desk and no
              third party doing support on anyone&rsquo;s behalf. The rest of
              section 4 covers every outside service this software genuinely
              contacts, and it is a short list.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.4 Map Tiles
            </h3>
            <p className="text-foreground mb-4">
              Several places in the app show a map, and your browser fetches its
              tiles directly from a third-party basemap provider. That provider
              therefore sees your IP address and which part of the world the map
              is showing — which is, roughly, where you dive. It does not
              receive your account, your dive log, or the name of anything on
              the map.
            </p>
            <p className="text-foreground mb-4">
              This happens whenever a map is on screen, whether or not you
              interact with it: the form to add or edit a dive site, a dive
              site&rsquo;s own page, the form to add or edit a trip, a trip with
              places on it, and the page of a dive that has a position — either
              from the site it was logged at or from the GPS reading in the file
              it was imported from. Where the map shows a recorded position,
              that is where you actually were rather than only which site you
              picked. Apart from those two forms, which load a map as soon as
              they open — one to place a pin on, one to show you the places you
              pick — a page with nothing to show loads no map and contacts
              nobody.
            </p>
            <p className="text-foreground mb-4">
              If you run your own copy of OpenDiving you can point it at a
              basemap you serve yourself, and none of this leaves your machine.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.5 Place Names
            </h3>
            <p className="text-foreground mb-4">
              After you place a dive site &mdash; on the map, or by pasting a
              pair of coordinates into the form &mdash; we ask a geocoding
              provider what that spot is called, so we can offer you a location
              like &ldquo;Dahab, Egypt&rdquo; to save with the site. Only the
              coordinates are sent, and they are sent by our servers rather than
              by your browser, so the provider never sees your IP address or
              anything else about you. The answer is cached, so the same spot is
              not looked up twice.
            </p>
            <p className="text-foreground mb-4">
              The dive site and trip forms also let you search for a place by
              name. There, what you type is what is sent &mdash; again by our
              servers, not your browser &mdash; a short moment after you stop
              typing. Nothing else about the form goes with it.
            </p>
            <p className="text-foreground mb-4">
              All of this happens only as you fill a form in, never when you
              view a site or a trip you have already saved. Type the coordinates
              in by hand and nothing is sent at all.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.6 Species Names
            </h3>
            <p className="text-foreground mb-4">
              The dive form lets you record what you saw, and the picker
              searches for it as you type &mdash; a short moment after you stop,
              once you have typed a couple of letters. It asks two public
              registers: the World Register of Marine Species, which is the
              authority on scientific names, and Wikidata, which supplies the
              common ones, so that typing &ldquo;clownfish&rdquo; finds the
              fish. What is sent is what you typed, and nothing else about the
              dive you are logging. As with place names, it is sent by our
              servers rather than by your browser, so neither register sees your
              IP address, your account, or anything else about you.
            </p>
            <p className="text-foreground mb-4">
              If you then pick a species this copy of OpenDiving has never seen
              before, we fetch its record so it can be saved. Both registers are
              asked again &mdash; the marine one for the taxonomy, Wikidata for
              the common name &mdash; and all either of them receives is the
              species&rsquo; number in the marine register: not what you typed,
              and nothing about you or the dive.
            </p>
            <p className="text-foreground mb-4">
              At that same moment we also ask a third outside service, Wikimedia
              Commons, whether it has a photograph of that species, and download
              the picture once if it does. What Commons receives is the name of
              an image file, worked out from the species&rsquo; number: again,
              not what you typed, and nothing about you or the dive. The picture
              is then stored on this copy of OpenDiving and served from here, so
              your browser never contacts Wikimedia and Wikimedia is never told
              which species you are looking at. Nothing is downloaded when a
              species already has its photo, and a species that has none is left
              without one rather than shown something else.
            </p>
            <p className="text-foreground mb-4">
              Most of the time none of those requests happens at all. Answers
              are kept for a month, and they are shared by everyone using this
              copy of OpenDiving rather than held per diver, so once anyone has
              searched for a name, nobody&rsquo;s search for it leaves again
              that month. The species themselves are shared in the same way:
              they are saved here once and belong to no one diver, so picking
              one that somebody has already picked sends nothing. The longer a
              copy of OpenDiving runs, the less it has to ask.
            </p>
            <p className="text-foreground mb-4">
              All of this happens only as you fill a dive in, never when you
              view a dive, a species or your species list you have already
              saved, and nothing is sent at all if you never open the species
              picker. The photographs on those pages come from this copy of
              OpenDiving like every other image on the site.
            </p>
            <p className="text-foreground mb-4">
              If you run your own copy of OpenDiving you can point it at your
              own copies of the two registers, and of the service the picture
              details are read from. The picture file itself is always fetched
              from Wikimedia&rsquo;s own servers: that one address is fixed in
              the software deliberately, so that a mistake in configuration
              cannot send this copy off to download images from somewhere it
              should not. Leaving any of them unset does not switch the search
              off &mdash; it narrows it to the species your own copy already
              holds.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.7 Legal Requirements
            </h3>
            <p className="text-foreground mb-4">
              Whoever runs this copy of OpenDiving may be compelled by law to
              hand over data they hold &mdash; a court order, or a valid demand
              from an authority with jurisdiction over them. That is a duty that
              falls on the operator, not a permission this page grants itself,
              and what they must do about such a demand is a question for them
              and their jurisdiction. Where the OpenDiving project is not the
              one running this copy, it holds none of your data and so has
              nothing it could be asked for; where it is, it is the operator
              this paragraph is about, and the duty falls on it like any other.
            </p>

            {/* Unconditional, unlike the Google subsection below it, and that is
                why it takes the fixed number and Google moves after it. An
                instance can be flipped between open and invite-only with a
                restart, so a section that appeared and disappeared with the mode
                would be a page that changes under a reader for a reason nothing
                on it explains. It is hedged in prose instead - the same shape §5's
                passwordless bullet uses for Google. See "The numbering in §4 is
                load-bearing, and §4.8 has changed hands" in DECISIONS.md. */}
            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.8 Inviting Someone to This Copy
            </h3>
            <p className="text-foreground mb-4">
              Whoever runs this copy decides whether anyone may create an
              account on it or only people who have been invited. Where it is
              invitations, this is the one place in the software where something
              about one person is shown to another, and this section is the
              whole of it.
            </p>
            <p className="text-foreground mb-4">
              An invitation carries no code, no link and no token &mdash; it is
              simply a note that this copy will let a particular address create
              an account. So there is nothing to forward and nothing to keep
              secret, and the person invited still has to prove they can read
              that mailbox in the ordinary way.
            </p>
            <p className="text-foreground mb-4">
              <strong>What the person you invite is told:</strong> your name, as
              it is on your account, and that you invited them to this copy.
              Nothing else about you, and nothing you have logged.{" "}
              <strong>What you are told:</strong> the address you invited, when
              you invited it, and whether it has been used to create an account
              &mdash; which is a fact about them, arriving because of something
              you did. Whoever runs this copy can see the same, because they can
              read the database on their own machine, which is true of
              everything on this page.
            </p>
            <p className="text-foreground mb-4">
              One thing more is disclosed, and only to the person doing the
              inviting: if you try to invite an address that already has an
              account here, this copy says so rather than leaving you to wonder
              why nothing arrived. That does tell you an address is registered,
              so what bounds it is a limit on how many invitations one account
              may <em>attempt</em> in a quarter of an hour, counted with the
              other rate limits in section 2.2 &mdash; not the separate limit on
              how many invitations you may send in a day, which counts only
              invitations that were actually sent and so never counts a refusal.
            </p>
            <p className="text-foreground mb-4">
              If this copy is not taking new accounts on its own, its home page
              offers a form for asking to be invited. The address typed there is
              stored so that whoever runs this copy can see who has asked; the
              form answers the same way whatever it did with the address, so
              nobody can use it to find out whether an address already has an
              account here. Whoever runs this copy is shown that flag when they
              look at the queue, so they can drop the request instead of
              inviting somebody who is already here. Section 7 says how long a
              pending request and an unused invitation are kept.
            </p>

            {googleClientId && (
              <>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  4.9 Signing In with Google
                </h3>
                <p className="text-foreground mb-4">
                  This copy of OpenDiving offers &ldquo;Continue with
                  Google&rdquo;, and until you press that button nothing about
                  you reaches Google. Opening the front page or the sign-in page
                  loads no code of Google&rsquo;s, contacts no Google address,
                  and gives Google no opportunity to set anything in your
                  browser. If you sign in another way, or never sign in at all,
                  Google is never told you were here.
                </p>
                <p className="text-foreground mb-4">
                  Pressing the button takes you to Google, because that is what
                  signing in with Google means. From that point you are on
                  Google&rsquo;s own site, under{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-muted-foreground"
                  >
                    its own privacy policy
                  </a>
                  , which this copy of OpenDiving neither controls nor can see.
                  Anything Google stores there is its own, on its own address,
                  rather than a third-party cookie on this one. You choose there
                  whether to go through with it, and if you change your mind
                  Google returns you here with nothing having happened.
                </p>
                <p className="text-foreground mb-4">
                  What comes back to your browser is a single-use code and
                  nothing else. It is this server, not your browser, that hands
                  that code to Google in exchange for confirmation of who you
                  are &mdash; a call made server to server, which is why nothing
                  identifying you passes through your browser at any point. This
                  copy stores no Google credential of any kind: it never asks
                  Google for the sort of token that would let it act as you
                  later, and the code and the one-time secret your browser kept
                  to match it are both used once and discarded.
                </p>
                <p className="text-foreground mb-4">
                  If you do sign in with Google, Google learns that you use this
                  copy of OpenDiving. And if that is the moment your account is
                  created, your Google profile picture is copied onto this
                  instance and becomes your avatar &mdash; once, at account
                  creation, and never again. Signing in with Google later does
                  not fetch it a second time, because by then the picture is
                  yours to change.
                </p>
                <p className="text-foreground mb-4">
                  An operator who would rather not offer this at all can leave
                  Google sign-in unconfigured, and then none of this &mdash;
                  including this section &mdash; exists on their copy at all.
                </p>
              </>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              5. Data Security
            </h2>
            <p className="text-foreground mb-4">
              What the software itself does:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Passwordless by design:</strong> There is no password
                field anywhere, and no password is stored, because none is ever
                set. You sign in with a link or a code sent to your email, with
                a passkey, or &mdash; where an instance offers it &mdash; with
                Google
              </li>
              <li>
                <strong>Single-use sessions:</strong> The cookie that keeps you
                signed in is spent and replaced on every use, and re-using a
                spent one is treated as a stolen session rather than a mistake.
                Each session is also a record on the server rather than only a
                token in your browser, which is what lets you see the devices
                signed in to your account and sign one of them out from another
                &mdash; section 6.1
              </li>
              <li>
                <strong>Nothing sensitive in browser storage:</strong> The
                short-lived token that authorises each request is held in memory
                and never written to storage at all, so a script running on the
                page has nothing to read. Section 10 is the full list of what is
                written
              </li>
              <li>
                <strong>Open to review:</strong> The source is public, so these
                claims can be checked rather than taken on trust, and security
                reports are welcome
              </li>
            </ul>
            <p className="text-foreground mb-4">
              What the software cannot promise on an operator&rsquo;s behalf:
              whether traffic to this copy is encrypted in transit, whether the
              disks it sits on are encrypted at rest, who has administrative
              access to the machine, and whether backups exist and where they
              go. Those are properties of a deployment, not of a program, and
              they belong to whoever runs this one. The self-hosting
              documentation tells operators how to get the first of them right;
              it cannot make them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              6. Your Privacy Rights and Choices
            </h2>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              6.1 Account Control
            </h3>
            <p className="text-foreground mb-4">
              From Settings, without asking anyone, you can:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Update your profile and account information</li>
              <li>Change the email address you sign in with</li>
              <li>
                See every device signed in to your account, and sign any of them
                out
              </li>
              <li>
                Where this copy is invite-only, invite someone, see the
                invitations you have sent, and take back one that has not been
                used
              </li>
              <li>Export everything you have entered</li>
              <li>Delete your account and everything attached to it</li>
            </ul>
            <p className="text-foreground mb-4">
              There are no privacy settings for your dive logs, and their
              absence is the point: nothing is public or shared, so there is
              nothing to switch off.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              6.2 Data Rights
            </h3>
            <p className="text-foreground mb-4">
              Depending on your location, you may have the right to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Access:</strong> Request a copy of your personal data
              </li>
              <li>
                <strong>Correction:</strong> Update inaccurate or incomplete
                information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal
                data
              </li>
              <li>
                <strong>Portability:</strong> Export your data in a common
                format
              </li>
              <li>
                <strong>Objection:</strong> Object to certain processing of your
                data
              </li>
              <li>
                <strong>Restriction:</strong> Request limitation of data
                processing
              </li>
            </ul>
            <p className="text-foreground mb-4">
              The first four need no request: access, correction, deletion and
              portability are all buttons in Settings, and they act immediately
              rather than being forwarded to somebody. Two things sit outside
              those buttons, and naming them is better than letting that
              sentence read wider than it is. The list of signed-in devices is
              on the settings page but is not part of the export. And the record
              of account security events in section 2.2 is in neither: nothing
              in the app shows it to you and no button copies it, so a copy of
              that one has to be asked for like the rights below. The last two,
              that request, and anything else go to whoever runs this copy
              &mdash; section 13 says how to reach them.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              6.3 Communication Preferences
            </h3>
            <p className="text-foreground mb-4">
              This copy of OpenDiving sends you three kinds of email, and the
              whole list is here. (It also delivers a contact-form message to
              whoever runs this copy, which is mail about you rather than to
              you.)
            </p>
            <p className="text-foreground mb-4">
              <strong>Emails that follow an action on this site:</strong> the
              sign-in message, which carries both a link and a code; the message
              confirming a new email address, sent to that new address; the
              message confirming that you asked to delete your account; and,
              where this copy is invite-only, the message telling an address
              that somebody here has invited it. None of these can be switched
              off without breaking the thing they are part of.
            </p>
            <p className="text-foreground mb-4">
              Only one of those four is sent to your account&rsquo;s own address
              &mdash; the deletion confirmation. The other three go to whatever
              address was typed, and it is worth being straight about what that
              means. Signing in needs no account, so anyone who types your
              address into this copy causes a sign-in message to be sent to you
              &mdash; which is why that message tells you to ignore it if it was
              not you, and why the link and code expire quickly and work only
              once. The address-confirmation message is the same shape: it goes
              to whatever new address a signed-in diver typed, for the express
              purpose of proving they can read it. Neither of those two is
              something the recipient can prevent, because the alternative is a
              sign-in flow that cannot start. The invitation goes to whatever
              address somebody with an account here invited, and names them so
              you know who; it is not preventable either, but for a different
              reason and it is worth being exact about which. Nothing turns on
              its arrival &mdash; the address is admitted the moment the
              invitation is made, so the message is a courtesy rather than a
              step, and the person who invited you could as easily have told you
              by other means. What makes it unpreventable is that this copy has
              no way to know, before sending, that an address would rather not
              hear from it. What bounds it instead is the limit in section 4.8
              on how many invitations one account may send.
            </p>
            <p className="text-foreground mb-4">
              Being sent to your own address is not the same as being sent
              because <em>you</em> acted, and this page will not blur the two.
              Deleting your account, and adding or removing a passkey, each
              email your account&rsquo;s address on the strength of a live
              session and nothing more &mdash; no re-checking that it is really
              you. So if somebody else had hold of your session, the message
              still arrives at you, about something you did not do. That is
              precisely why the notices in the next group exist and cannot be
              switched off.
            </p>
            <p className="text-foreground mb-4">
              <strong>
                Security notices, which arrive because your account changed
                &mdash; whether or not it was you who changed it:
              </strong>{" "}
              when a passkey is added to your account, and when one is removed.
              And when your email address is changed, a note goes to the{" "}
              <em>old</em> address naming the new one. That last one exists
              precisely so that the owner of an address finds out even if they
              were not the person who changed it, which is why it cannot be
              switched off: an alert you can silence is not an alert.
            </p>
            <p className="text-foreground mb-4">
              <strong>One scheduled email</strong>, under one condition. If you
              set a service schedule on a piece of gear you have not archived,
              this copy will email you when that service comes due. It is not a
              drumbeat: one email when something enters &ldquo;due soon&rdquo;,
              one when it goes overdue, and then &mdash; because a schedule left
              overdue would otherwise go quiet forever &mdash; a reminder every
              three months for as long as it stays overdue. Logging the service,
              or changing the interval, starts the cycle over. Gear with no
              schedule on it, or gear you have archived, is never mentioned.
            </p>
            <p className="text-foreground mb-4">
              Those reminders are on by default, on the reasoning that a
              reminder nobody switched on is a reminder that never arrives. The
              switch is in Settings, under Notifications, and turning it off
              stops all of them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              7. Data Retention
            </h2>
            <p className="text-foreground mb-4">
              While your account exists, what you have entered is kept. That is
              what a dive log is for &mdash; a logbook that quietly discarded
              your older dives would be the wrong product.
            </p>
            <p className="text-foreground mb-4">
              Two of the records in section 2.2 expire on their own, whether or
              not you delete anything, because neither is anything you entered.
              A <strong>signed-in device&rsquo;s session</strong> is deleted
              once it can no longer sign you in: you signed that device out, you
              signed out on it, or it went unused long enough to lapse. And the{" "}
              <strong>account security events</strong> are swept on a schedule
              &mdash; entries tied to an account after 90 days, and entries that
              name only an email address, from before any account existed, after
              7 days. That shorter one is deliberately the same short life the
              sign-in link&rsquo;s own record already has: an address someone
              typed into this copy and never came back to should not outlive it
              here.
            </p>
            <p className="text-foreground mb-4">
              Two more expire on their own where this copy is invite-only, and
              both hold an address belonging to somebody who may have no account
              here at all. A <strong>request to be invited</strong> is kept for
              up to 90 days from when it was made, and goes sooner if whoever
              runs this copy invites the address or removes the request. An{" "}
              <strong>invitation nobody has used</strong> is kept for up to 90
              days from when it was sent, whether or not it was taken back
              before then; after that the address is refused again until
              somebody invites it afresh. An invitation that <em>was</em> used
              is not swept, because by then it belongs to two accounts and goes
              when either of them does.
            </p>
            <p className="text-foreground mb-4">
              When you delete your account:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                It first goes into a short grace period, during which signing in
                again brings it back intact. The email confirming the deletion
                says when that period ends
              </li>
              <li>
                Personal information is permanently deleted within 30 days
              </li>
              <li>
                The deletion is not a flag or an archive: the account row and
                everything hanging off it &mdash; dives, sites, trips, gear,
                courses, certifications &mdash; are destroyed, and the files you
                uploaded are unlinked from disk with them
              </li>
              <li>
                Any invitations you sent go with it, used or not. Somebody you
                invited who has not created an account yet loses the invitation
                and would have to be invited again by someone else. Any
                invitation or pending request naming <em>your</em> address is
                found by that address and removed as well
              </li>
              <li>
                Your sessions and your account security events go with it. The
                entries made before the account existed have nothing linking
                them to it, so they are found by the email address instead
                &mdash; the same way the sign-in records already are. The one
                gap that cannot close: entries left under an address you later
                moved off are not named by the deletion, and expire on their own
                7-day schedule instead
              </li>
            </ul>
            <p className="text-foreground mb-4">
              Nothing is held back for &ldquo;legitimate business
              purposes&rdquo;; there is no business here to have them. Two
              honest caveats remain, and both belong to the deployment rather
              than to the software: whatever backups the operator keeps are
              theirs to expire, and a deletion cannot reach into a backup
              already written; and an operator under a legal obligation to
              preserve something is subject to it whatever this page says.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              8. Where Your Data Lives
            </h2>
            <p className="text-foreground mb-4">
              Your data lives on this instance, and where that is, is a fact
              about its operator&rsquo;s deployment. There is no network of
              servers behind it and no transfer between countries built into the
              software: one copy of OpenDiving is one database and one files
              volume, wherever the person running it chose to put them.
            </p>
            <p className="text-foreground mb-4">
              If that matters to you &mdash; and under some data-protection laws
              it does &mdash; the operator is who can tell you, and section 13
              says how to ask. If you run the copy yourself, the answer is your
              own machine.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              9. Children's Privacy
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is not intended for children under 13, and this copy
              does not knowingly collect personal information from anyone under
              13. If its operator becomes aware that it has, deleting the
              account removes it.
            </p>
            <p className="text-foreground mb-4">
              Divers between 13 and 18 should have a parent&rsquo;s agreement
              before using the Service, particularly given what it is a log of.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              10. What Is Stored in Your Browser
            </h2>
            <p className="text-foreground mb-4">
              Two kinds of thing: one cookie that keeps you signed in, and a
              short list of preferences remembered on this device. None of it is
              advertising or analytics, which is why this page has no cookie
              banner for you to click through &mdash; there is nothing here to
              ask you to accept.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              10.1 The sign-in cookie
            </h3>
            <p className="text-foreground mb-4">
              One cookie, named <StorageKey name="refresh_token" />, and in
              normal operation it is the only one this software sets. It is what
              keeps you signed in. Your browser will not let scripts on the page
              read it, it is sent only back to this site, and by default it is
              marked so that it travels only over an encrypted connection.
            </p>
            <p className="text-foreground mb-4">
              It is single-use: each time it is spent a fresh one replaces it,
              with the clock started again. So the window rolls rather than
              running out on a fixed date &mdash; signing in keeps you signed in
              on this browser until about a week goes by without you using the
              app, not for a week from when you signed in. So a browser you keep
              using stays signed in for as long as nothing ends its session, and
              the next paragraph is what can. &ldquo;About a week&rdquo; is the
              standard setting, and the operator of this copy can change it.
            </p>
            <p className="text-foreground mb-4">
              It is cleared when you sign out and when your account is deleted.
              It also stops being accepted when the session behind it is ended
              somewhere else: signing that device out from the list in Settings,
              using &ldquo;Sign out other sessions&rdquo; there, or &mdash; on
              an account with an improbable number of devices signed in at once
              &mdash; this copy dropping the least recently used one to make
              room. In each of those the browser can keep working a little
              longer on the short-lived token described below, which runs out on
              its own, and is then signed out. A spent cookie turning up again
              is treated as a stolen session rather than as a retry.
            </p>
            <p className="text-foreground mb-4">
              The token that actually authorises each request is deliberately
              not stored anywhere. It is held in the tab&rsquo;s memory, dies
              when you close the tab, and is worked out again from the cookie
              above the next time you open the app. That is the reason the rest
              of this list is so short.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              10.2 Preferences remembered on this device
            </h3>
            <p className="text-foreground mb-4">
              {googleClientId ? "Ten" : "Nine"} entries in your browser&rsquo;s
              local storage. Every one of them is read only by the page you are
              on: none is sent to this server, and none is sent anywhere else.
              Where a row below says how long an entry is kept, read it as
              &ldquo;unless you tell this browser to stop remembering&rdquo;
              &mdash; 10.3 is the switch that does that, and says which of these
              it reaches.
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <StorageKey name="theme" /> &mdash; whether you picked light,
                dark, or whatever your system is set to. Kept until you change
                it
              </li>
              <li>
                <StorageKey name="opendiving:post-auth-redirect" /> &mdash;
                where to send you after you click a sign-in link, since the link
                is opened from your mail app and lands on a page that has no
                other way to know. It expires after 24 hours, is cleared when
                you sign out, and is read once and removed. It can hold an
                in-app address such as a particular dive&rsquo;s page, which
                anyone else at this browser could read &mdash; which is exactly
                why it does not linger
              </li>
              {googleClientId && (
                <li>
                  <StorageKey name="opendiving:google-sign-in-attempts" />{" "}
                  &mdash; the one-time secret that proves a &ldquo;Continue with
                  Google&rdquo; sign-in coming back from Google is the one you
                  started here, along with where you were headed. Written only
                  when you press that button, one entry per attempt so that two
                  tabs cannot spoil each other&rsquo;s, read once and removed
                  the moment Google returns you, and expiring after 30 minutes
                  if it never does
                </li>
              )}
              <li>
                <StorageKey name="opendiving:passkey-nudge-dismissed" /> &mdash;
                that you dismissed the offer to add a passkey on this browser.
                Kept until you undo that from the passkeys card in your settings
              </li>
              <li>
                <StorageKey name="opendiving:dive-profile-series-v3" /> &mdash;
                which lines you last had showing on a dive profile chart. Kept
                until you change them
              </li>
              <li>
                <StorageKey name="opendiving:gas-use-series" /> &mdash; the same
                for the gas-use chart. Kept until you change them
              </li>
              <li>
                <StorageKey name="opendiving:dive-activity-view" /> &mdash;
                which period the dashboard&rsquo;s activity chart is showing.
                Along with the period it holds a date to anchor it, worked out
                from the dates of your own dives, so this one is derived from
                your data rather than being only a setting. Kept until you
                change it
              </li>
              <li>
                <StorageKey name="opendiving:gas-use-view" /> &mdash; the same
                for the gas-consumption card, with the same anchor date. Kept
                until you change it
              </li>
              <li>
                <StorageKey name="opendiving:entry-units" /> &mdash; which units
                you would rather type in, per field, so that a rented cylinder
                gauge in psi does not make you convert in your head. Cleared
                when you sign out, so that the next person at this browser is
                not handed your choice
              </li>
              <li>
                <StorageKey name="opendiving:device-memory-opt-out" /> &mdash;
                that you used the switch in 10.3 to say this browser should stop
                remembering your display preferences. 10.3 lists exactly which
                of the entries above that reaches. This is the one entry here
                that exists because you asked for it, and the only way this
                browser can keep honouring that answer after you close the tab.
                Kept until you turn the switch back off
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              10.3 Telling this browser to stop remembering
            </h3>
            <p className="text-foreground mb-4">
              Changing a preference is not the same as declining to have one
              stored, and under some rules &mdash; UK law is the clearest case
              &mdash; storage of this kind owes you a simple way to object to
              the storage itself rather than to the value. Here is that way. It
              applies to this browser, it costs nothing, and you do not need an
              account to use it.
            </p>
            <DeviceMemorySwitch />
            <p className="text-foreground mb-4 mt-4">
              Seven of those {googleClientId ? "ten" : "nine"} are covered:{" "}
              <StorageKey name="theme" />, both chart-line entries, both
              chart-period entries, <StorageKey name="opendiving:entry-units" />{" "}
              and <StorageKey name="opendiving:passkey-nudge-dismissed" />.
              Turning the switch on deletes each of them that exists and refuses
              the next write of any of them. It also sweeps out anything else
              this site left behind under the same{" "}
              <StorageKey name="opendiving:" /> naming, including entries older
              versions of this software wrote and nothing reads any more.
              Turning it back off restores nothing &mdash; the stored values
              were what you objected to &mdash; it only lets later choices be
              remembered again.
            </p>
            <p className="text-foreground mb-4">
              {googleClientId
                ? "Three are not covered."
                : "Two are not covered."}{" "}
              <StorageKey name="opendiving:post-auth-redirect" />{" "}
              {googleClientId ? (
                <>
                  and <StorageKey name="opendiving:google-sign-in-attempts" />{" "}
                  are what carry a sign-in you started here across the hop
                  through your mail app or through Google, and each removes
                  itself &mdash; read once and gone, and expiring on its own if
                  you never come back.
                </>
              ) : (
                <>
                  is what carries a sign-in you started here across the hop
                  through your mail app, and it removes itself &mdash; read once
                  and gone, and expiring on its own if you never come back.
                </>
              )}{" "}
              And the switch&rsquo;s own entry stays, because an objection this
              browser forgot the moment you closed the tab would not be one.
            </p>
            <p className="text-foreground mb-4">
              Clearing your browser&rsquo;s data for this site removes all of
              them too, and we would still rather not dress that up as a control
              we give you. It is your browser&rsquo;s, not ours; it cannot
              single one of these out; and it also destroys the sign-in cookie
              above and signs you out. The switch is ours, and it is the one
              that can.
            </p>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              10.4 What is never stored
            </h3>
            <p className="text-foreground mb-4">
              There is no session storage, no IndexedDB database and no service
              worker. There is no analytics or telemetry of any kind &mdash; not
              disabled, not configurable, simply absent, and no such dependency
              is in the build. The fonts this site is written in are served from
              this instance and fetched from nowhere else. The one exception is
              the lettering on the map itself: its labels are drawn from glyph
              ranges requested, as they are needed, from the same basemap
              provider that serves its tiles &mdash; so it is the party already
              described in section 4.4, and not a new one.
            </p>
            <p className="text-foreground mb-4">
              This software sets no third-party cookies of its own. One outside
              party acts on its own account rather than ours, and it is
              disclosed above rather than denied: the basemap provider your
              operator chose, whose servers answer the requests described in
              section 4.4 and may set cookies of their own.
            </p>
            {googleClientId && (
              <p className="text-foreground mb-4">
                Google used to be the second, and deliberately is not any more.
                Nothing of Google&rsquo;s runs in your browser on this site, and
                Google sets nothing in your browser under this address. Signing
                in with Google takes you to Google, where whatever it stores is
                its own on its own address &mdash; section 4.9 has the detail.
              </p>
            )}
            <p className="text-foreground mb-4">
              One exception belongs to operators rather than to divers. If this
              copy has the optional admin panel turned on, that panel sets its
              own session cookies under its own address. They are the tool of
              whoever administers this copy, they appear only for someone
              signing in to it, and they are documented for operators in the
              self-hosting documentation rather than here. That panel is a
              separate thing from the Admin section inside this app, which
              whoever runs this copy reaches from their own account menu: those
              are ordinary pages on this address, signed in to exactly like the
              rest of it, and they store nothing of their own.
            </p>
            <p className="text-foreground mb-4">
              The rule this project holds itself to, stricter than the law
              requires: the day any analytics, A/B testing or advertising
              storage is added to OpenDiving, a real consent flow ships with it
              and this section changes in the same breath. And any new key added
              to browser storage owes this section a line in the same change
              &mdash; a rule with a test behind it rather than only good
              intentions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-foreground mb-4">
              This page is part of the software, so it changes when the software
              changes and ships in the same release. There is no separate
              mechanism that emails everyone about a policy change, and this
              page is not going to promise one it does not have.
            </p>
            <p className="text-foreground mb-4">
              What exists instead is better in one respect: the page is in the
              public source repository, so its full history &mdash; every edit,
              when it was made, and what it replaced &mdash; is readable by
              anyone, and no version of it can be quietly withdrawn. Which
              version you are reading depends on which release of OpenDiving
              this copy is running.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              12. Open Source Transparency
            </h2>
            <p className="text-foreground mb-4">
              A privacy policy is usually a promise you have to take on trust.
              This one does not have to be:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                The code is public, so every claim on this page can be checked
                against what actually runs
              </li>
              <li>
                The reasoning behind the awkward parts is written down in the
                repository too, including the parts this page admits are
                imperfect
              </li>
              <li>
                Anyone who finds this page saying something the code does not do
                can report it, and that is treated as a defect rather than as
                wording
              </li>
              <li>
                If you would rather trust nobody at all, you can run your own
                copy, and then every question on this page has the same answer:
                you
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              13. Contact
            </h2>
            <p className="text-foreground mb-4">
              Most of what people write to a privacy address to ask for, you can
              simply do. Exporting everything you have entered and deleting your
              account are both buttons in Settings; they work immediately, they
              need nobody&rsquo;s approval, and no request has to be sent to
              anyone.
            </p>
            <p className="text-foreground mb-4">
              For anything else &mdash; a question about this page, about how
              this copy is run, or about a right in section 6.2 that Settings
              does not cover &mdash; the person to ask is whoever runs this copy
              of OpenDiving. They are the controller of your data, whether that
              is the OpenDiving project running a copy of its own or somebody
              else entirely; an author who does not run this copy holds none of
              your data and could not answer for whoever does. The{" "}
              <Link
                href="/contact"
                className="underline hover:text-muted-foreground"
              >
                contact page
              </Link>{" "}
              is how this copy offers to reach them.
            </p>
            <p className="text-foreground mb-4">
              Two things this page will not do, both deliberately. It will not
              print an address belonging to the OpenDiving project as the
              software&rsquo;s author, because the address that can act on a
              privacy request is the operator&rsquo;s, and the contact page
              above is already it &mdash; on a copy the project runs itself,
              that page reaches the project too, in the role that can answer.
              Sent to the author instead, the request reaches people with no
              access to this copy. And it will not point you at a public issue
              tracker, because a question about your own data is not something
              you should have to ask in public. How quickly you get an answer is
              the operator&rsquo;s to say, not this page&rsquo;s.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              This policy describes this copy of OpenDiving, and is part of the
              release it ships in.
            </p>
            <Link
              href="/"
              className="mt-4 sm:mt-0 text-sm font-medium text-foreground underline hover:text-muted-foreground"
            >
              Back to OpenDiving
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
