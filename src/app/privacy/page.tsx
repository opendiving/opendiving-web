import Link from "next/link";
import type { Metadata } from "next";
import { runtimeConfig } from "@/lib/runtime-config";
import { CERTIFICATION_EXPIRING_SOON_DAYS } from "@/lib/certification";
import { readLegalPageConfig } from "@/lib/api/config.server";
import { DeviceMemorySwitch } from "@/components/device-memory-switch";
import {
  OperatorAnswer,
  OperatorBlock,
} from "@/components/legal/operator-block";
import { Card, CardContent } from "@/components/ui/card";
import { PAGE_COLUMN } from "@/components/ui/map-hero";

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
export default async function PrivacyPage() {
  // Read here rather than in a client component for the reason `/support` reads it
  // here: this is a Server Component, so the instance's configuration is legible
  // without shipping it to the browser. The Google section below exists only where
  // an instance has Google sign-in turned on.
  const { googleClientId } = runtimeConfig();
  // The other things about this instance the page renders differently, and the only
  // other ones, read in one request. Nothing short of the API answering `true` earns
  // the operator block, on the same asymmetry the landing hero's two voices run on: a
  // page that names a person who never touched the reader's machine is the expensive
  // direction to be wrong in. The join-link sentences follow the same rule, so a copy
  // that has set up no join link carries no word about them, and so do the map
  // tiles: a copy whose server draws none says its cards and page heads show no
  // map.
  const {
    projectOperated,
    joinLinks,
    mapTiles,
    diveConditions,
    commonsPrimary,
  } = await readLegalPageConfig();
  // Last of the conditional sections, so its number follows whichever of them this
  // copy has. A sentence elsewhere that proposing makes false is reworded inline on
  // `commonsPrimary`, and on every other copy reads as it always has.
  const proposingSection =
    13 + (googleClientId ? 1 : 0) + (diveConditions ? 1 : 0);

  // Eight things every copy has, the map tiles and the proposals where it has them.
  const outsideTheButtons = ["Eight", "Nine", "Ten"][
    Number(mapTiles) + Number(commonsPrimary)
  ];

  return (
    <div className={PAGE_COLUMN}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground">Last updated: November 2026</p>
      </div>

      <Card>
        <CardContent className="pt-(--card-pad)">
          {projectOperated && (
            <OperatorBlock
              intro={
                <>
                  Most of the questions a reader has about a deployment are left
                  to the operator below, because the software cannot know them.
                  On this copy it can, and these are the answers. Each names the
                  sections it belongs to.
                </>
              }
            >
              <OperatorAnswer question="Where this copy runs — §4.3, §8">
                On Render, in its Frankfurt region, in Germany. Every part of
                this instance is there: the app, the API, the background worker,
                {mapTiles && <> the map renderer §4.4 describes,</>} the
                Postgres database and the short-lived counter store §2.2
                describes.{" "}
                {commonsPrimary ? (
                  <>
                    There is no second site, and nothing of your account is
                    copied to one. The OpenDiving Commons records section 4.
                    {proposingSection} describes are the exception that is not
                    yours: they are public, and they are copied to a public
                    repository on GitHub.
                  </>
                ) : (
                  "There is no second site and nothing is copied to one."
                )}
              </OperatorAnswer>
              <OperatorAnswer question="Where uploaded files are kept — §4.3, §8">
                In Cloudflare R2, created under Cloudflare&rsquo;s EU
                jurisdiction, which is its setting for keeping objects within
                the European Union. That covers the dive-computer files kept
                with a dive, the files of an import waiting to be applied,
                certification card images, profile pictures and portraits, and
                the species photographs §4.6 says this copy downloads.
                {mapTiles && (
                  <>
                    {" "}
                    So are the map tiles §4.4 says this copy draws, which are
                    drawn from the map alone and are nobody&rsquo;s.
                  </>
                )}
              </OperatorAnswer>
              <OperatorAnswer question="How email is sent — §4.3, §6.3">
                Through Resend, with delivery routed through its EU region.
                Resend&rsquo;s own documentation says that account data,
                including email metadata, logs and API records, is stored in the
                United States regardless, so the record that a message went to
                your address is held there even though the message itself is not
                sent from there.
              </OperatorAnswer>
              <OperatorAnswer question="Which basemap and which geocoder — §4.4, §4.5">
                The basemap is OpenFreeMap, at{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
                  tiles.openfreemap.org
                </code>
                , which is the third-party provider §4.4 is about and the one
                §10.4 says the map lettering comes from. Place names come from
                two geocoders, both asked by this server rather than by your
                browser, exactly as §4.5 describes: OpenStreetMap&rsquo;s
                Nominatim names a spot you place on the map, and Photon, run by
                komoot GmbH in Germany, answers a place you search for by name.
              </OperatorAnswer>
              <OperatorAnswer question="Whether traffic is encrypted in transit — §5">
                Yes. TLS terminates at Render&rsquo;s edge and a plain HTTP
                request is redirected to HTTPS; inside the deployment the app,
                the API
                {mapTiles
                  ? ", the worker and the map renderer"
                  : " and the worker"}{" "}
                reach the database and each other over Render&rsquo;s private
                network rather than across the internet.
              </OperatorAnswer>
              <OperatorAnswer question="Whether the disks are encrypted at rest — §5">
                Both providers say so, and this is their statement reported
                rather than a promise this page makes. Render&rsquo;s
                documentation says its Postgres databases are encrypted at rest
                with AES-256, and that this covers primary instances, replicas
                and all backups. Cloudflare&rsquo;s says every object stored in
                R2, its metadata included, is encrypted at rest with AES-256,
                automatically and with nothing to configure.
              </OperatorAnswer>
              <OperatorAnswer question="Who has administrative access — §5">
                The operator named above, and the operations staff of the
                providers named here — Render, Cloudflare and Resend — who can
                reach the systems their own services run on, as any
                provider&rsquo;s can. No other person holds an administrative
                account on this copy.
              </OperatorAnswer>
              <OperatorAnswer question="What logs and backups exist, and for how long — §2.2, §5, §7">
                Render keeps this instance&rsquo;s request logs — the server
                logs §2.2 opens with — for 7 days. The database has
                point-in-time recovery covering the last 3 days, which is the
                whole of what §7&rsquo;s &ldquo;a deletion cannot reach into a
                backup already written&rdquo; caveat means here.
              </OperatorAnswer>
              <OperatorAnswer question="That deletion finishes inside the 30 days §7 promises — §7">
                It does, with room to spare. Deleting an account starts a 14-day
                grace period, after which the data is destroyed; the 3-day
                recovery window above is the longest a copy of it can survive in
                a backup after that. Seventeen days at the outside.
              </OperatorAnswer>
              <OperatorAnswer question="How long an import is kept — §2.1, §7">
                The files of an import are held for 24 hours at most, and the
                review and log of one you applied are kept for thirty days.
              </OperatorAnswer>
              <OperatorAnswer question="How to check any of this against the source — §1, §5, §11, §12">
                Those four sections invite you to read the code rather than
                trust this page &mdash; §5 puts it as{" "}
                <em>the source is public, so these claims can be checked</em>{" "}
                &mdash; and that invitation is open: the project&rsquo;s
                repositories are public. What they hold is the project&rsquo;s
                source rather than proof of what this copy runs, so the
                operator&rsquo;s route stands beside it: the{" "}
                <Link
                  href="/terms"
                  className="underline hover:text-muted-foreground"
                >
                  Terms
                </Link>{" "}
                carry a standing offer of the complete source of the version
                running on this copy, on request from the address above, and
                name what identifies that version.
              </OperatorAnswer>
              <OperatorAnswer question="The minimum age on this copy — §9">
                Sixteen. §9 gives the software&rsquo;s floor of 13; Germany sets
                16 as the age at which a person can agree to this kind of
                service on their own, under Article 8 of the GDPR, and this copy
                follows the higher of the two.
              </OperatorAnswer>
            </OperatorBlock>
          )}

          <div className="prose max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                1. Introduction
              </h2>
              <p className="text-foreground mb-4">
                OpenDiving is open-source software for logging dives. Anyone can
                download it and run their own copy, and this page describes{" "}
                <strong>this</strong> copy &mdash; the one you are reading it
                on.
              </p>
              <p className="text-foreground mb-4">
                So &ldquo;we&rdquo; and &ldquo;our servers&rdquo; on this page
                mean whoever runs this copy of OpenDiving. Writing the software
                and running a copy of it are two roles rather than necessarily
                two parties: the OpenDiving project is the author of the
                software always, and is an operator only of the copies it runs
                itself. Authorship on its own carries nothing across &mdash; for
                a copy the project does not run, it runs no servers for that
                copy, receives no data from it, and never sees what you log
                there. Where the project does run a copy, it is that
                copy&rsquo;s operator as well, and every commitment this page
                makes of the operator is one it makes in that role, exactly as
                any other operator does. Under data-protection law the operator
                of this copy is the controller of your data, and they are who is
                answerable for it.
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
                  <strong>Check-in Details:</strong> What a dive shop asks for
                  at the desk, all of it optional: a portrait, meaning a photo
                  of your face cropped like a passport photo; your date of birth
                  and phone number; the email address you enter for check-in,
                  which need not be the one you sign in with; emergency
                  contacts, meaning other people&rsquo;s names, phone numbers
                  and relationships to you, which you enter; and your dive
                  insurance policies &mdash; for each, the provider, the policy
                  number and when it expires. A check-in link you make shows
                  them to whoever holds it, as section 4.9 describes
                </li>
                <li>
                  <strong>Dive Logs:</strong> Dive location, depth, duration,
                  the kind of dive it was, conditions, the boat you dived from,
                  gas mixes, species seen, each with a count and a note, your
                  own rating of the dive, the tags you file it under, and your
                  notes; and, where your dive computer measured it, your heart
                  rate through the dive, with its highest and average figures.
                  Your heart rate is data about your health: it is stored with
                  the dive, shown to you alone, and included when you export
                  your logbook
                </li>
                <li>
                  <strong>Dive Drafts:</strong> A dive you save before logging
                  it, here or in the OpenDiving app &mdash; whatever of the dive
                  log above it holds so far, and on the app the gear set you
                  loaded and the items you ticked off it. A draft is kept until
                  you log it, which makes it a dive, or discard it
                </li>
                <li>
                  <strong>Dive-Computer Files:</strong> When you fill a dive in
                  from a dive-computer file, that file itself is kept alongside
                  the dive &mdash; on the recording it came from, under the
                  filename it arrived with, and a dive keeps every one you
                  upload. A dive-computer or logbook file you import in another
                  format than DiveJSON is kept the same way when it is one dive:
                  on the dive it becomes, under the filename it arrived with. A
                  logbook of several dives, and a DiveJSON document, leave no
                  file here, and importing a full archive puts back the files it
                  carries. The files of an import are held on the server from
                  the upload until you apply or discard it, or until the limit
                  whoever runs this copy has set, if there is one, runs out, so
                  that you can finish it on another device; only files the app
                  could read are held, and they are deleted once the import is
                  applied. An import applied as it is uploaded, without a
                  review, holds no file at all. An import&rsquo;s review and log
                  stay readable after that, for as long as whoever runs this
                  copy keeps them, which may be until you delete them. A dive
                  the OpenDiving app downloads from a dive computer over
                  Bluetooth keeps the computer&rsquo;s original download the
                  same way, on the dive it becomes. A file from a computer with
                  a wrist sensor or a heart-rate strap switched on carries your
                  heart rate, which is read into the dive log above. The account
                  also keeps the order you put your dive computers in, by their
                  serial numbers, which decides whose recording a dive shows by
                  default when more than one of them recorded it
                </li>
                <li>
                  <strong>Equipment Data:</strong> Diving equipment details and
                  service records
                </li>
                <li>
                  <strong>Contacts:</strong> The dive centers, schools, shops,
                  clubs and places you stayed that you record, to name them from
                  your dives, courses, certifications, service records and trips
                  &mdash; a name, what each one is to you, and, if you add them,
                  its phone number, email address, website, postal address,
                  where it is on a map and your notes. A contact can be a person
                  rather than a business &mdash; the friend whose flat you
                  stayed in &mdash; and what you record about them is then
                  somebody else&rsquo;s data, which you enter
                </li>
                <li>
                  <strong>People:</strong> The buddies, guides, instructors,
                  fellow students and companions you record, to name them from
                  your dives, trips, courses and certifications &mdash; a name,
                  the role each had on a dive, a trip or a course, and, if you
                  add them, an email address, a phone number and your notes.
                  What you record about a person is somebody else&rsquo;s data,
                  which you enter. You can link a person to their account on
                  this copy by typing its username, and section 4.10 says what
                  that shows, and to whom
                </li>
                <li>
                  <strong>Photo Proposals:</strong> A Wikimedia Commons file
                  that a tool of yours proposes as a species&rsquo; photo, with
                  the note it adds saying why. Neither app offers this; section
                  4.12 says who reads it and what is sent where
                </li>
                {commonsPrimary && (
                  <li>
                    <strong>Proposals for OpenDiving Commons:</strong> A dive
                    site of yours, or a change to a Commons site, that you
                    propose: its shared facts, which follow your edits while a
                    new site waits, the words you ticked and when, and any
                    message you add for the reviewer. Who reads that, and what
                    is published, is section 4.{proposingSection}
                  </li>
                )}
                <li>
                  <strong>Support Requests:</strong> Whatever you write on the
                  support page, if this copy has one configured, and the address
                  you give to reply to
                </li>
              </ul>
              <p className="text-foreground mb-4">
                Both pictures are kept as the file you picked &mdash; or, for
                the portrait, the one a full archive carries, if you take it in
                the import &mdash; so that you can change how either is cropped
                later, with the location and camera details a phone photo
                carries removed by this server before the file is stored; what
                the app shows is drawn from that file at the crop you chose.
                Your portrait is shown to you where you edit it and on your
                check-in page, and to whoever holds a check-in link you made
                (section 4.9), and never where your profile picture appears. The
                full archive export carries both files, and both are deleted
                with your account.
              </p>
              <p className="text-foreground mb-4">
                One thing arrives without you typing it. If you create your
                account by signing in with Google, your Google profile picture
                is fetched by this server and stored here as your avatar &mdash;
                once, when the account is made, and never again afterwards. That
                only happens on instances with Google sign-in turned on; section
                4.13 describes it if this one does.
              </p>
              <p className="text-foreground mb-4">
                Two more addresses can reach this copy before any account
                exists, and both belong to whoever is running it rather than to
                a directory of any kind. If this copy is not taking new accounts
                on its own, its home page offers a form for{" "}
                <strong>asking to be invited</strong>: the address you type
                there is stored while the request is pending, for up to 90 days,
                or until whoever runs this copy invites you or removes the
                request, or an account is created here with that address. Being
                invited does not erase it &mdash; it becomes an{" "}
                <strong>invitation</strong> instead, which records the address
                invited, the account that sent it, whether it came by that
                account&rsquo;s invite link, whether it has been used, and,
                until it is used, whether it answered a request to be invited;
                it is what lets you create an account here. Where this copy is
                invite-only, every account can also make an{" "}
                <strong>invite link</strong>, a token kept on that
                account&rsquo;s record until its owner resets or removes it.
                Section 4.8 is about all three, and section 7 says how long each
                is kept.
              </p>
              <p className="text-foreground mb-4">
                {commonsPrimary
                  ? "There are no photos of dives, no bio, no experience level, and no comments or posts, because there are no community features to put them in. The messages here are the note a tool of yours adds to a photo proposal, the word you may add to a proposal for OpenDiving Commons, and the reason a reviewer may give for declining either, which pass between you and the reviewer and go no further."
                  : "There are no photos of dives, no bio, no experience level, and no comments or posts, because there are no community features to put them in. The one message here is the note a tool of yours adds to a photo proposal, and the reason whoever runs this copy may give for declining it, which pass between you and them and go no further."}
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                2.2 Automatically Collected Information
              </h3>
              <p className="text-foreground mb-4">
                Seven things are recorded without you asking for them, and all
                seven are ordinary machinery. Two of them &mdash; signed-in
                devices and account security events &mdash; are also counted,
                into daily totals that name nobody, which the end of this
                section describes:
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>
                  <strong>Server logs:</strong> Your IP address and browser user
                  agent, and the address of each request, written by the web
                  server the way every web server writes them. For a search of
                  the dive site map, that address carries the centre of the map
                  and, when you search the area on screen, its edges, each cut
                  to about a kilometre, as section 2.3 describes. How long{" "}
                  <em>those</em> are kept, and whether they are kept at all, is
                  a question about the operator&rsquo;s deployment rather than
                  about this software. The next two entries are a different
                  matter: there the app stores the IP address and the user agent
                  itself, in its own database, and section 7 says for how long
                </li>
                <li>
                  <strong>Signed-in devices:</strong> Each time you sign in,
                  this copy writes down the session &mdash; the IP address the
                  sign-in came from, your browser&rsquo;s user agent as it sent
                  it, when the session was made and last used, and how long it
                  stays signed in while unused &mdash; a browser&rsquo;s window
                  or the OpenDiving app&rsquo;s longer one, which section 10.1
                  describes. That record is what makes the list in Settings
                  possible, and it is the only reason signing another device out
                  can work at all. It is also counted into the day&rsquo;s total
                  of active accounts, below. It holds nothing from the sign-in
                  cookie itself
                </li>
                <li>
                  <strong>Account security events:</strong> A record of things
                  that happen to accounts on this copy, and this is the whole
                  list &mdash; a sign-in link requested; an invitation asked
                  for; an invitation sent; an invite link made; an invite link
                  removed; a sign-in succeeding, or a sign-in code got wrong; a
                  verified sign-in being offered a new account to make, or a
                  deleted one to bring back; an account created or restored; a
                  second way of signing in attached to an existing account; a
                  passkey added or removed; an API key made or revoked; a
                  passkey reporting a use count that suggests it has been
                  copied; an email address change asked for or completed; an
                  account asked to be deleted; a sign-out; one device signed
                  out, or every other one at once; and a spent sign-in cookie
                  turning up again. Each entry holds what happened and when, the
                  IP address and user agent it came from, which way into the
                  account it was about &mdash; email, Google, a passkey or an
                  API key &mdash; where that applies, and the account it was
                  about, or, for something that happened before any account
                  existed, the email address that was typed. An invitation sent
                  is the one entry that carries both, because both are the point
                  of it: the account that sent the invitation, and the address
                  it went to. Never a link, a code, a token or a key itself,
                  only the fact that one was issued or used. Nothing in the app
                  shows these to you; they are there for whoever runs this copy
                  to look into a break-in or a burst of sign-in attempts, and
                  section 6.2 says what that means for asking for a copy. The
                  successful sign-ins among them are also counted into the
                  day&rsquo;s total of accounts that signed in, below
                </li>
                <li>
                  <strong>Rate-limit counters:</strong> To stop sign-in, the
                  support form and the invite-request form being hammered, this
                  server counts recent requests in a short-lived store. The
                  counters are keyed three ways &mdash; by IP address, by the
                  email address a sign-in link, a support request or an
                  invitation was requested for, and by account id for things you
                  can only do signed in, such as exporting your data, importing
                  a logbook, changing your username or email, linking a person
                  to an account, registering a passkey, making an API key,
                  inviting somebody, proposing a photo for a species,{" "}
                  {commonsPrimary && "proposing for OpenDiving Commons, "}
                  looking up place and species names, and searching the dive
                  site map. Each counter is a number and expires by itself:
                  after 5 minutes on dive site map searches, after 15 minutes on
                  the sign-in and account paths, after an hour on the support
                  form, the invite-request form, exports, logbook imports, and
                  the place- and species-name lookups; and after a day on photo
                  proposals
                  {commonsPrimary && " and on proposals for OpenDiving Commons"}
                  . Other counters exist that hold no identifier at all &mdash;
                  they cap how often this server as a whole may call an outside
                  provider, and are keyed on the provider, not on anyone
                </li>
                <li>
                  <strong>Passkey labels:</strong> If you register a passkey, a
                  coarse label worked out from your browser &mdash; something
                  like &ldquo;Chrome on macOS&rdquo; &mdash; is saved with it,
                  so a list of passkeys tells you which is which
                </li>
                <li>
                  <strong>Retry records:</strong> When the OpenDiving app on a
                  phone creates something &mdash; a dive, a dive site, a person
                  &mdash; it sends a one-off key with the request, so that
                  sending it again after a reply was lost on a bad connection
                  cannot create it twice. For each key this copy keeps the
                  account it came from, the key, which kind of thing was being
                  created, a digest of what was sent from which the request
                  cannot be read back, the outcome, the identifier of the record
                  it made, and when. Nothing of the record itself is copied into
                  it. A tool of your own calling this copy with an API key, as
                  section 4.11 describes, may send one too and leaves the same
                  record. A browser sends none, so using this site adds none.
                  Section 7 says how long they are kept
                </li>
                <li>
                  <strong>Replaced sites:</strong> When a dive site of yours is
                  replaced with a Commons site, this copy keeps the removed
                  site&rsquo;s identifier with your account, pointing at the
                  record that took its place. Nothing else of the site is kept
                  in it. Section 3 says what it is for and section 7 how long it
                  stays
                </li>
              </ul>
              <p className="text-foreground mb-4">
                What is kept in your browser is a separate matter, and section
                10 lists all of it. No usage data about <em>you</em> is
                collected: nothing here measures which pages you visit, which
                dives you open, or how long you spend, and none of the seven
                above is compared or profiled. The security record names things
                that happened to your account &mdash; not what you were doing in
                the app.
              </p>
              <p className="text-foreground mb-4">
                What is counted is a set of <strong>daily totals</strong>, each
                a number per day for this copy as a whole: how many accounts
                were created, and through which door &mdash; an invitation, an
                invitation answering a request to be invited, signing up where
                this copy lets anyone in,{" "}
                {joinLinks && (
                  <>a join link, counted under where it was posted, </>
                )}
                or being the first account on a new copy; how many accounts
                signed in; and how many were active, meaning a signed-in session
                of theirs was used that day. No account is named in any of them.
                They are not anonymous in every case, though, and this page will
                not claim they are: on a day when only one account was created,
                that day&rsquo;s total and the account&rsquo;s own creation date
                together show which door it came through. Section 7 says how
                long the totals are kept.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                2.3 Location Information
              </h3>
              <p className="text-foreground mb-4">
                Location reaches this server five ways, and all five start with
                you:
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>
                  Coordinates you place yourself &mdash; a pin on the map, or a
                  pair of coordinates typed into a dive site, trip or contact
                  form
                  {commonsPrimary &&
                    ", or into a change you propose to a Commons site"}
                  . Choosing a Commons site, which section 4.2 describes, sends
                  no position of yours: the position is the site&rsquo;s own,
                  and what is recorded is that you used it
                </li>
                <li>
                  GPS positions recorded inside a dive-computer file you import,
                  which are where you actually were rather than which site you
                  picked
                </li>
                <li>
                  Coordinates carried in a logbook you import &mdash; a logbook
                  file can record where a dive entered and left the water, where
                  a dive site is and its entry in a registry such as
                  OpenStreetMap, where a trip went and where a contact is, and
                  those are written as the file gives them
                </li>
                <li>
                  GPS positions inside a photo you pick as your profile picture
                  or portrait, or inside the portrait carried by a full archive
                  you import, which travel with the upload and are removed by
                  this server before the photo is stored &mdash; an
                  archive&rsquo;s only if you take it in the import
                </li>
                <li>
                  The centre of the dive site map in the Sites section and in
                  the dive form&rsquo;s <em>Find a dive site</em>, sent with
                  each search of it, and the edges of the part on screen when
                  you search that area &mdash; each cut to two decimal places,
                  about a kilometre, whatever moved the map: you dragging it, a
                  place you picked, the dive, its sites or the trip it opened
                  on, or the answer to <em>Use my location</em> from your
                  browser or your phone
                </li>
              </ul>
              <p className="text-foreground mb-4">
                The app asks your browser where you are in one place, the{" "}
                <em>Use my location</em> button on the dive site map, and only
                when you press it &mdash; never as a page opens &mdash; and your
                browser asks you before it answers. The answer moves the map and
                nothing is sent when it arrives: what reaches this server is the
                map&rsquo;s centre with your next search, rounded to about a
                kilometre like every other search&rsquo;s. The app stores it
                nowhere. Because the centre travels in the request&rsquo;s
                address, it is in the server logs section 2.2 describes, for as
                long as those are kept. The page is served with a header that
                lets only this app&rsquo;s own pages ask the browser where you
                are, so nothing embedded in one can. What the basemap provider
                sees when a map is on screen is a different question, and
                section 4.4 answers it.
              </p>
              <p className="text-foreground mb-4">
                The OpenDiving app on a phone has the same dive site map, in its
                Sites tab and in the dive form, and asks the phone where you are
                the first time that map opens, through the phone&rsquo;s own
                prompt. Whatever you answer, it does not ask again. If you allow
                it, the Sites tab opens on where the phone is, and so does the
                dive form&rsquo;s map when the dive has no site with a pin and
                no GPS position to open on; <em>Use my location</em> moves the
                map there too. The position stays on the phone: what reaches
                this server is the point the list is measured from &mdash; the
                map&rsquo;s centre, where the phone shows a map &mdash; sent as
                the map opens and with every search after, rounded to about a
                kilometre like every other search&rsquo;s, and in the server
                logs for as long as those are kept. The app stores it nowhere.
                If you refuse, <em>Use my location</em> says where in the
                phone&rsquo;s settings to allow it. The app also uses the
                phone&rsquo;s location when you ask it to place a dive site or a
                trip where you are, which puts a pin there as one you placed
                yourself.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. How We Use Your Information
              </h2>
              <p className="text-foreground mb-4">
                We use your information to:
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>
                  <strong>Provide the Service:</strong> Store your dives, dive
                  drafts, sites, trips, gear, courses, certifications, contacts,
                  people, tags and check-in details, show them back to you,
                  answer a tool you gave an API key as it would answer you,
                  within what that key allows, show you the current username of
                  an account you linked a person to, show your check-in page to
                  whoever holds a check-in link you made, and, where this copy
                  is invite-only, show your name to whoever opens your invite
                  link
                </li>
                <li>
                  <strong>Account Management:</strong> Sign you in, keep you
                  signed in, and let you change or delete your account
                </li>
                <li>
                  <strong>Email:</strong> Send you a sign-in link and code,
                  confirm an address change, confirm a deletion, tell an address
                  that it has been invited here, tell you when a passkey is
                  added to or removed from your account and when an API key is
                  made or revoked on it, tell your old address when your email
                  address is changed, remind you when gear you have set a
                  service schedule on comes due and when a certification or one
                  of your insurance policies nears or passes its expiry date,
                  and send you your year of diving in figures each January. If
                  you use the support form, deliver what you wrote to whoever
                  runs this copy. Section 6.3 lists all of these and says which
                  arrive without you asking
                </li>
                <li>
                  <strong>Decide who may create an account:</strong> Where this
                  copy is invite-only, keep its invitations and the requests
                  waiting on them, so that the address that was invited is the
                  one that gets in, and so that whoever runs this copy can see
                  who has asked; keep each member&rsquo;s invite link, and let
                  in whoever follows one
                  {joinLinks && (
                    <>, and let in whoever follows one of its join links</>
                  )}
                  . Section 4.8 says what that shows to whom, and section 7 how
                  long either is kept
                </li>
                <li>
                  <strong>Keep the instance standing:</strong> Apply the rate
                  limits described in section 2.2
                </li>
                <li>
                  <strong>Keep your account secure:</strong> Keep the record of
                  signed-in devices from section 2.2, so you can see them and
                  sign one out, and keep the record of account security events,
                  so whoever runs this copy can look into a break-in or a burst
                  of sign-in attempts. Both expire on a schedule &mdash; section
                  7
                </li>
                <li>
                  <strong>Create things once:</strong> Keep the retry records
                  from section 2.2, so that something the OpenDiving app, or a
                  tool of yours, sends again after a lost reply is created once
                  rather than twice
                </li>
                <li>
                  <strong>Follow a replaced site:</strong> Keep the identifier
                  of a site you replaced with a Commons site, from section 2.2,
                  so that a write the OpenDiving app queued against the site, or
                  a dive draft naming it, still lands on the record
                </li>
                <li>
                  <strong>Review a photo proposal:</strong> Show a photo a tool
                  of yours proposes for a species, with your name and its note,
                  to whoever runs this copy, tell the tool what became of it,
                  and keep a declined file from being proposed for that species
                  again. Section 4.12 says exactly what that shows and sends
                </li>
                {commonsPrimary && (
                  <li>
                    <strong>Keep OpenDiving Commons:</strong> Show what you
                    propose for OpenDiving Commons to whoever reviews it, tell
                    you what became of it, publish what is accepted, without
                    your name, and keep the proposal as the evidence of what you
                    affirmed. Section 4.{proposingSection} says exactly what
                    that shows and publishes
                  </li>
                )}
                <li>
                  <strong>Count how this copy is used:</strong> Keep the daily
                  totals from section 2.2 &mdash; accounts created and through
                  which door, accounts that signed in, accounts that were active
                  &mdash; so whoever runs this copy can see how many people it
                  serves and how they got in. They name nobody
                </li>
              </ul>
              <p className="text-foreground mb-4">
                And nothing else. Your data is not profiled, not used to
                personalise anything, not used to pick content for you, not
                sold, and not fed to advertising. There is no advertising here
                to feed.
                {commonsPrimary &&
                  " A record accepted into OpenDiving Commons is a different thing, being no longer your data: it is in the public domain, so anyone may use it for anything, and this page cannot promise otherwise."}
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Information Sharing and Disclosure
              </h2>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                {commonsPrimary
                  ? "4.1 What Is Public Here"
                  : "4.1 Nothing Here Is Public"}
              </h3>
              <p className="text-foreground mb-4">
                {commonsPrimary
                  ? "Nothing you enter is published unless you propose it for OpenDiving Commons and a reviewer accepts it."
                  : "Nothing you enter is published."}{" "}
                There are no public profiles, no public dive logs, no feeds, no
                forums, and no public ratings or reviews: the rating you give a
                dive is part of your own log. Every dive, trip, gear item,
                course, certification, contact, person and tag{" "}
                {commonsPrimary
                  ? "is kept for one account and shown to that account alone, and a dive site you add yourself is too, until you propose it."
                  : "belongs to one account and is visible to that account alone, and so is every dive site you add yourself."}{" "}
                A Commons site belongs to no account, as section 4.2 says, and
                your notes, tags and dives on one are as private as the rest.{" "}
                {commonsPrimary
                  ? "No setting publishes anything: the one way something you entered becomes public is a proposal a reviewer accepts, one site at a time. You make every other exception yourself too:"
                  : "There is no setting that makes any of it public, because there is nothing for such a setting to do. The exceptions are ones you make yourself:"}{" "}
                a check-in link shows your check-in page to whoever holds it,
                for a day, and section 4.9 says exactly what that shows; where
                this copy is invite-only, an invite link shows your name &mdash;
                and nothing you entered &mdash; to whoever opens it, until you
                reset or remove it, as section 4.8 says; an API key you make
                lets whatever holds it read your account as you &mdash; and
                change it, if you let it &mdash; until it expires or you revoke
                it, as section 4.11 says; {!commonsPrimary && "and "}a photo a
                tool of yours proposes for a species is shown, with your name
                and its note, to whoever runs this copy, as section 4.12 says
                {commonsPrimary && (
                  <>
                    ; and a dive site or a change you propose is read by whoever
                    reviews it and, once accepted, is public for good, as{" "}
                    section 4.{proposingSection} says
                  </>
                )}
                .
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.2 What Other Divers Can See
              </h3>
              <p className="text-foreground mb-4">
                {commonsPrimary
                  ? "What you enter stays in your account unless you propose it for OpenDiving Commons, or a tool of yours proposes a photo for a species. There are no groups, nothing one diver can post for another, and no shared logs,"
                  : "What you enter stays in your account unless a tool of yours proposes a photo for a species. There are no groups, no comments and no shared logs,"}{" "}
                and the people you record are your own notes about them rather
                than a connection between two accounts.{" "}
                {commonsPrimary ? (
                  <>
                    Another diver with an account on this same copy sees no
                    dive, trip, gear item, course, certification, contact,
                    person or tag of yours, and no dive site you added unless it
                    has been accepted into OpenDiving Commons. The account that
                    reviews proposals does read a photo proposal of yours, as
                    section 4.12 says, and a site you propose, as section 4.
                    {proposingSection} says.
                  </>
                ) : (
                  "Another diver with an account on this same copy cannot see any dive, dive site you added, trip, gear item, course, certification, contact, person or tag of yours. Whoever runs this copy does read a photo proposal of yours, as section 4.12 says."
                )}{" "}
                What does cross between accounts, when you link a person to one,
                runs towards you and is small: that an account with the username
                you typed, or with the identifier a file you imported carried,
                exists here; what its username is now; and, in your own export,
                its identifier.
              </p>
              <p className="text-foreground mb-4">
                There are {commonsPrimary ? "five" : "four"} exceptions. The
                first is not about anything you entered: inviting somebody shows
                them your name, and shows you whether they went on to register;
                and, where this copy is invite-only, an invite link you make
                shows your name to whoever opens it, and shows you the name on
                the account of anyone who creates one through it. Section 4.8
                sets out exactly what that discloses, in both directions. The
                second is exactly about what you entered: a check-in link you
                make shows your check-in page to whoever holds the link, another
                diver included, until it expires or you revoke it. Section 4.9
                sets out what that shows. The third runs the other way and is
                about another account rather than yours: linking a person you
                recorded to an account here shows you that account&rsquo;s
                current username, and tells the account nothing. Section 4.10
                sets out what that discloses. The fourth is about what you
                entered, and only a tool of yours can make it: a photo it
                proposes for a species is shown to whoever runs this copy, with
                your name and its note. Section 4.12 sets out what that shows.
                {commonsPrimary && (
                  <>
                    {" "}
                    The fifth is about what you entered too, and you choose it
                    each time: a dive site or a change you propose for
                    OpenDiving Commons is shown to whoever reviews it, with your
                    name, and what is accepted is public, without it. Section 4.
                    {proposingSection} sets out what that shows and publishes.
                  </>
                )}
              </p>
              <p className="text-foreground mb-4">
                Two things every account on this copy does draw on belong to no
                one diver. The first is the catalogue of species &mdash; the
                fish themselves, saved here once. It records what a species is,
                never who saw it; section 4.6 explains how it fills up.
              </p>
              <p className="text-foreground mb-4">
                The second is OpenDiving Commons, a pool of dive sites this copy
                carries: its name, position and the other facts of the place,
                drawn from open sources such as OpenStreetMap and Wikidata
                {commonsPrimary &&
                  ", and from what divers have proposed on this copy"}
                . A Commons site is one record every account can use, marked{" "}
                <em>Commons</em> in your list of sites, on its own page and in
                the searches that find it, and it is not copied into yours when
                you log a dive there or save it to your sites. The notes, tags
                and dives you add to it are yours alone: they are kept apart
                from the record, and no other account can see them
                {commonsPrimary
                  ? ". Nor can another account see that you use the site, apart from whoever reviews a change you propose to it."
                  : ", or that you use the site at all."}{" "}
                Removing a Commons site from your sites deletes your notes and
                tags on it and takes it off your dives, which stay in your log,
                and leaves the record as it was.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.3 Hosting and Email
              </h3>
              <p className="text-foreground mb-4">
                This copy of OpenDiving runs wherever its operator put it
                &mdash; their own hardware, or a hosting provider of their
                choosing. That provider necessarily holds the machine your data
                sits on, and which provider it is, if any, is the
                operator&rsquo;s decision rather than the software&rsquo;s.
              </p>
              <p className="text-foreground mb-4">
                Email reaches you through whatever mail server the operator
                configured, so that server handles the address a sign-in link or
                a reminder is sent to. There is no customer support desk and no
                third party doing support on anyone&rsquo;s behalf. The rest of
                section 4 covers every outside service this software genuinely
                contacts, and it is a short list.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.4 Map Tiles
              </h3>
              <p className="text-foreground mb-4">
                {commonsPrimary ? "Seven" : "Five"} places in the app show a map
                your browser draws itself, and for those your browser fetches
                the map&rsquo;s tiles directly from a third-party basemap
                provider. That provider therefore sees your IP address and which
                part of the world the map is showing — which is, roughly, where
                you dive. It does not receive your account, your dive log, or
                the name of anything on the map.
              </p>
              <p className="text-foreground mb-4">
                Your browser does this whenever one of those maps is on screen,
                whether or not you interact with it: the Sites section, which
                loads its map of dive sites as soon as it opens; the form to add
                or edit a dive, whose site field opens that same map in{" "}
                <em>Find a dive site</em> when you ask for it; the form to add
                or edit a dive site and the form to add or edit a trip, which
                load a map as soon as they open — one to place a pin on, one to
                show you the places you pick — {!commonsPrimary && "and "}the
                form to add or edit a contact, which loads one only when you ask
                it to show the map
                {commonsPrimary && (
                  <>
                    , the step that checks a site of yours before it is
                    proposed, which loads one when it opens, and the screen
                    where this copy&rsquo;s operator reviews what divers propose
                    for OpenDiving Commons, which loads one when a proposal is
                    opened
                  </>
                )}
                . Apart from those {commonsPrimary ? "seven" : "five"}, no page
                has your browser contact the provider.
              </p>
              <p className="text-foreground mb-4">
                Those maps name places in English and, where the map has a name
                for a place in the language your browser is set to, in that
                language as well. Your browser picks that language itself, and
                the app adds it to nothing it sends. The provider learns it all
                the same: like every browser, yours names the languages it is
                set to in each request it makes, to this provider as to any
                site.
              </p>
              {mapTiles ? (
                <>
                  <p className="text-foreground mb-4">
                    The cards that list your dives and trips carry a map too,
                    and so does the head of the page of a dive, a trip and a
                    dive site. On this copy this server draws those maps rather
                    than your browser, in tiles &mdash; squares of the world map
                    with nothing of yours in them. The first time anyone on this
                    copy is shown a part of the world, the server fetches what
                    that tile needs from the same provider, draws it and keeps
                    it; your browser fetches the tiles from this server and puts
                    the pins on them itself. So for those maps the provider sees
                    this server&rsquo;s address rather than yours, once for each
                    tile rather than for each picture or each time you look.
                    That is every card in the list of your dives, Home&rsquo;s
                    recent dives and the dives listed on the page of a dive
                    site, a trip, a piece of gear, a species, a course or a
                    person; in the list of your trips and Home&rsquo;s recent
                    trips; and the head of a dive&rsquo;s, a trip&rsquo;s and a
                    dive site&rsquo;s own page. A dive or a dive site with no
                    position shows no map, and a trip&rsquo;s shows the whole
                    world until it has a place on it. A dive has a position from
                    the site it was logged at, from the GPS reading in the
                    dive-computer file it was imported from, or from a logbook
                    file that carried the position itself; where its map shows a
                    recorded position, that is where you actually were rather
                    than only which site you picked.
                  </p>
                  <p className="text-foreground mb-4">
                    Each of those tile requests carries the language your
                    browser is set to. The server reduces it to a language
                    &mdash; German, say, for a browser set to Austrian German
                    &mdash; and draws the tile&rsquo;s place names in English
                    and, where the map has a name in that language, in it as
                    well; a language the map names nothing in, or English, gets
                    the tile in English alone. The language itself goes no
                    further than this server, but the lettering a tile is drawn
                    in comes from the provider as it does for the forms&rsquo;
                    maps &mdash; so for a language not written in the Latin
                    alphabet the provider can tell that this server drew that
                    alphabet, though not for whom.
                  </p>
                  <p className="text-foreground mb-4">
                    The tiles are shared: everyone this copy shows a part of the
                    world in the same language is shown the same tiles, and a
                    tile this server already keeps reaches a browser sooner than
                    one it still has to draw. So another member of this copy who
                    timed their own requests could tell that someone here was
                    shown a region some tens of kilometres across in the last 30
                    days, and that it was someone whose browser is set to a
                    given language &mdash; though not who, and nothing of what
                    they logged there. Section 7 says how long the tiles are
                    kept.
                  </p>
                </>
              ) : (
                <p className="text-foreground mb-4">
                  The cards that list your dives and trips show no map on this
                  copy, and nor does the head of the page of a dive, a trip or a
                  dive site: drawing those maps is this server&rsquo;s job, and
                  this copy has not been set up to do it. So your browser
                  fetches no tiles for them, and neither does this server.
                </p>
              )}
              <p className="text-foreground mb-4">
                The paragraphs above describe a browser. The OpenDiving app on a
                phone draws a map of its own in{" "}
                {commonsPrimary ? "seven" : "six"} places: the Sites tab and the
                dive form&rsquo;s <em>Find a Dive Site</em>, which load the map
                of dive sites as they open, the form to add a dive site and the
                search for a site&rsquo;s location, the form to add a trip,{" "}
                {!commonsPrimary && "and "}the form to add a contact, which
                loads one only when you ask it to show the map
                {commonsPrimary &&
                  ", and the step that checks a site of yours before it is proposed"}
                . It draws these maps only where this server draws tiles, so on
                a copy that draws none those screens show no map. To draw one,
                the OpenDiving app names the phone&rsquo;s language to this
                server when it asks for the map&rsquo;s style, and fetches the
                map directly from the same basemap provider, which sees the
                phone&rsquo;s IP address, the part of the world on screen, the
                OpenDiving app&rsquo;s name and version and the iOS version that
                its requests&rsquo; User-Agent header names, and the language
                settings that their Accept-Language header names, and nothing of
                your account.
              </p>
              <p className="text-foreground mb-4">
                If you run your own copy of OpenDiving you can point it at a
                basemap you serve yourself, and none of this leaves your
                machine.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.5 Place Names
              </h3>
              <p className="text-foreground mb-4">
                After you place a dive site &mdash; on the map, or by pasting a
                pair of coordinates into the form &mdash; we ask a geocoding
                provider what that spot is called, so we can offer you a
                location like &ldquo;Dahab, South Sinai, Egypt&rdquo; to save
                with the site. Only the coordinates are sent, and they are sent
                by our servers rather than by your browser, so the provider
                never sees your IP address or anything else about you. The
                answer is cached, so the same spot is not looked up twice.
              </p>
              <p className="text-foreground mb-4">
                The dive site and trip forms also let you search for a place by
                name, and so does the search on the dive site map in the Sites
                section and in the dive form&rsquo;s <em>Find a dive site</em>,
                which finds places as well as sites. There, what you type is
                what is sent &mdash; again by our servers, not your browser
                &mdash; a short moment after you stop typing, and it may go to a
                different provider from the one that names a spot. Nothing else
                about the form or the map goes with it: the map&rsquo;s centre a
                search carries stays with this server.
              </p>
              <p className="text-foreground mb-4">
                All of this happens only as you fill a form in or search the
                dive site map, never when you view a site or a trip you have
                already saved. Type the coordinates in by hand and nothing is
                sent at all.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.6 Species Names
              </h3>
              <p className="text-foreground mb-4">
                The dive form lets you record what you saw, and the picker
                searches for it as you type &mdash; a short moment after you
                stop, once you have typed a couple of letters. It asks two
                public registers: the World Register of Marine Species, which is
                the authority on scientific names, and Wikidata, which supplies
                the common ones, so that typing &ldquo;clownfish&rdquo; finds
                the fish. What is sent is what you typed, and nothing else about
                the dive you are logging. As with place names, it is sent by our
                servers rather than by your browser, so neither register sees
                your IP address, your account, or anything else about you.
              </p>
              <p className="text-foreground mb-4">
                If you then pick a species this copy of OpenDiving has never
                seen before, we fetch its record so it can be saved. Both
                registers are asked again &mdash; the marine one for the
                taxonomy, Wikidata for the common name &mdash; and all either of
                them receives is the species&rsquo; number in the marine
                register: not what you typed, and nothing about you or the dive.
              </p>
              <p className="text-foreground mb-4">
                Importing a logbook does the same thing without a picker being
                involved at all. A logbook file can name marine life this copy
                of OpenDiving has never seen, and those species are looked up
                before the import is written &mdash; the same two registers, the
                same request, carrying the species&rsquo; number and nothing
                about you. Species it cannot match are left out of the import
                rather than guessed at, and it tells you which.
              </p>
              <p className="text-foreground mb-4">
                At that same moment &mdash; whether the species came from the
                picker or from a file you imported &mdash; we also ask a third
                outside service, Wikimedia Commons, whether it has a photograph
                of that species, and download the picture once if it does. What
                Commons receives is the name of an image file, worked out from
                the species&rsquo; number: again, not what you typed, and
                nothing about you or the dive. The picture is then stored on
                this copy of OpenDiving and served from here, so your browser
                never contacts Wikimedia and Wikimedia is never told which
                species you are looking at. Nothing is downloaded when a species
                already has its photo, and a species that has none is left
                without one rather than shown something else.
              </p>
              <p className="text-foreground mb-4">
                Most of the time none of those requests happens at all. Answers
                are kept for a month, and they are shared by everyone using this
                copy of OpenDiving rather than held per diver, so once anyone
                has searched for a name, nobody&rsquo;s search for it leaves
                again that month. The species themselves are shared in the same
                way: they are saved here once and belong to no one diver, so
                picking one that somebody has already picked sends nothing. The
                longer a copy of OpenDiving runs, the less it has to ask.
              </p>
              <p className="text-foreground mb-4">
                All of this happens only as you fill a dive in or import a
                logbook, never when you view a dive, a species or your species
                list you have already saved. If you never open the species
                picker, never import a file naming marine life and never have a
                tool propose a photo for a species, nothing is sent at all. A
                photo proposal is the one case in which Wikimedia Commons is
                sent a name you chose rather than one worked out here, and
                section 4.12 says when. The photographs on those pages come from
                this copy of OpenDiving like every other image on the site.
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
                hand over data they hold &mdash; a court order, or a valid
                demand from an authority with jurisdiction over them. That is a
                duty that falls on the operator, not a permission this page
                grants itself, and what they must do about such a demand is a
                question for them and their jurisdiction. Where the OpenDiving
                project is not the one running this copy, it holds none of your
                data and so has nothing it could be asked for; where it is, it
                is the operator this paragraph is about, and the duty falls on
                it like any other.
              </p>

              {/* Unconditional, unlike the Google subsection below it, and that is
                why it takes a fixed number and Google moves after it. An
                instance can be flipped between open and invite-only with a
                restart, so a section that appeared and disappeared with the mode
                would be a page that changes under a reader for a reason nothing
                on it explains. It is hedged in prose instead - the same shape §5's
                passwordless bullet uses for Google. Its last paragraph, on join
                links, is the one part that comes and goes, with `join_links`: a
                copy that has set none up must carry no word about them, and a
                paragraph moves no number. See "The numbering in §4 is
                load-bearing, and conditional sections sit last" in DECISIONS.md. */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.8 Inviting Someone to This Copy
              </h3>
              <p className="text-foreground mb-4">
                Whoever runs this copy decides whether anyone may create an
                account on it or only people who have been invited
                {joinLinks && <> or who follow one of its join links</>}. Where
                it is invitations, this is one of the{" "}
                {commonsPrimary ? "five" : "four"} places in the software where
                something about one person is shown to another &mdash; the
                others are a check-in link, in section 4.9, linking a person to
                an account, in section 4.10,{" "}
                {commonsPrimary ? (
                  <>
                    a photo proposal, in section 4.12, and a proposal for
                    OpenDiving Commons, in section 4.{proposingSection}
                  </>
                ) : (
                  "and a photo proposal, in section 4.12"
                )}{" "}
                &mdash; and this section is the whole of it.
              </p>
              <p className="text-foreground mb-4">
                An invitation you make by typing an address carries no code, no
                link and no token &mdash; it is simply a note that this copy
                will let a particular address create an account. So there is
                nothing to forward and nothing to keep secret, and the person
                invited still has to prove they can read that mailbox in the
                ordinary way.
              </p>
              <p className="text-foreground mb-4">
                Where this copy is invite-only, you also have an{" "}
                <strong>invite link</strong> of your own, on the Invitations
                card in your settings: an address on this site, shown as a QR
                code or sent, that lets whoever follows it create an account
                here, counted as your invitation. It is the opposite of a typed
                invitation in the one way that matters: anyone holding it can
                use it, whatever address they sign in with, until you reset or
                remove it, and each account made through it counts against the
                same limit as the invitations you send. What it carries is kept
                only where letting somebody in needs it: signing in by email, on
                the sign-in link&rsquo;s own record, which is deleted within
                about a week
                {googleClientId && (
                  <>
                    ; signing in with Google, in your browser until Google sends
                    you back, as section 10.2 says
                  </>
                )}
                . It is written onto no account.
              </p>
              <p className="text-foreground mb-4">
                <strong>What the person you invite is told:</strong> your name,
                as it is on your account, and that you invited them to this
                copy. Where this copy is invite-only, whoever opens your invite
                link sees your name too, whether or not they go on to register,
                and is told, before they sign in, that you will see the name on
                their account. Nothing else about you, and nothing you have
                logged. <strong>What you are told:</strong> the address you
                invited, when you invited it, and whether it has been used to
                create an account &mdash; which is a fact about them, arriving
                because of something you did; and, for somebody who joined
                through your invite link, the name on their account and when
                they joined, and never their address. Whoever runs this copy can
                see the same, because they can read the database on their own
                machine, which is true of everything on this page.
              </p>
              <p className="text-foreground mb-4">
                One thing more is disclosed, and only to the person doing the
                inviting: if you try to invite an address that already has an
                account here, this copy says so rather than leaving you to
                wonder why nothing arrived. That does tell you an address is
                registered, so what bounds it is a limit on how many invitations
                one account may <em>attempt</em> in a quarter of an hour,
                counted with the other rate limits in section 2.2 &mdash; not
                the separate limit on how many invitations you may make in a
                day, by address or through your invite link, which counts only
                invitations actually made and so never counts a refusal.
              </p>
              <p className="text-foreground mb-4">
                If this copy is not taking new accounts on its own, its home
                page offers a form for asking to be invited. The address typed
                there is stored so that whoever runs this copy can see who has
                asked; the form answers the same way whatever it did with the
                address, so nobody can use it to find out whether an address
                already has an account here. Whoever runs this copy is shown
                that flag when they look at the queue, so they can drop the
                request instead of inviting somebody who is already here.
                Section 7 says how long a pending request and an unused
                invitation are kept.
              </p>
              {joinLinks && (
                <p className="text-foreground mb-4">
                  This copy also has <strong>join links</strong>. A join link is
                  an address on this site carrying the name of a place whoever
                  runs this copy posted it &mdash; a forum, say &mdash; and
                  following one lets you create an account here without an
                  invitation; the page it opens names the place. That name is
                  what lets you in, and it is kept only where letting you in
                  needs it: signing in by email, on the sign-in link&rsquo;s own
                  record, which is deleted within about a week
                  {googleClientId && (
                    <>
                      ; signing in with Google, in your browser until Google
                      sends you back, as section 10.2 says
                    </>
                  )}
                  . It is never written onto your account, nor into the record
                  of account security events. When your account is created, that
                  day&rsquo;s total of accounts made through that link goes up
                  by one &mdash; the daily totals in section 2.2 &mdash; and
                  nothing else of the link remains. That total names nobody, but
                  on a day when only one account was created, it and the
                  account&rsquo;s creation date together show which link the
                  account came by.
                </p>
              )}

              {/* Unconditional for the reason §4.8 is: every diver on every copy can
                make one, so Google stays after every unconditional section. */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.9 Check-in Links
              </h3>
              <p className="text-foreground mb-4">
                Your check-in page can make a link to itself, for a dive shop to
                open on its own phone or computer &mdash; from a QR code on your
                screen, or an address you send. This is another of the places in
                the software where something about one person is shown to
                another,{" "}
                {commonsPrimary
                  ? "one of the three that show what you entered"
                  : "one of the two that show what you entered"}
                , and this section is the whole of it.
              </p>
              <p className="text-foreground mb-4">
                <strong>What a link shows:</strong> your check-in page as it
                prints &mdash; your name and your portrait if you have one, your
                date of birth and phone number, the email address you entered
                for check-in, your insurance policies, your emergency contacts,
                your dive count, deepest dive and last dive, and each
                certification with its number, dates, instructor and dive
                center, beside the front of the card where you stored a picture
                of it. Never the back of a card, and never the address you sign
                in with; a card kept as a PDF is named as one rather than shown;
                and neither your profile picture nor anything else this copy
                holds about you is shown at all.
              </p>
              <p className="text-foreground mb-4">
                <strong>Who can open it:</strong> anyone who has the link, with
                no account and no signing in &mdash; which is what lets a desk
                open it. Treat it like the printout it stands in for: whoever
                you give it to can pass it on. The page asks search engines not
                to list it.
              </p>
              <p className="text-foreground mb-4">
                <strong>For how long:</strong> 24 hours from when you made it.
                Revoking it from your check-in page stops it at once, and so
                does making another, since only one of your links works at a
                time. Asking to delete your account stops it too.
              </p>
              <p className="text-foreground mb-4">
                <strong>What this copy keeps:</strong> a fingerprint of the link
                rather than the link itself, which is why your check-in page
                cannot show you its QR code or address again once you leave it;
                when it was made, when it expires, and whether you revoked it;
                and your dive count, deepest dive and last dive as the page
                showed them when you made it, so a correction you made for that
                day is what the link shows and a dive logged afterwards does not
                change it. Everything else is read from your account each time
                the link is opened, so a change you make shows at once. Section
                7 says when a link is deleted.
              </p>

              {/* Unconditional too: every diver on every copy can link a person,
                so Google stays after it. */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.10 Linking a Person to an Account
              </h3>
              <p className="text-foreground mb-4">
                A person you record &mdash; a buddy, an instructor &mdash; may
                have an account on this same copy. Type that account&rsquo;s
                username into the person and this copy links the two, so that
                the username the account has now shows beside the name you gave
                them.{" "}
                {commonsPrimary
                  ? "This is the third of the five places"
                  : "This is the third of the four places"}{" "}
                in the software where something about one person is shown to
                another, and this section is the whole of it.
              </p>
              <p className="text-foreground mb-4">
                <strong>What you are shown:</strong> whether an account with
                exactly that username exists here &mdash; which choosing a
                username of your own already tells anyone, since a username that
                exists is one you cannot take &mdash; and, once the person is
                linked, that account&rsquo;s current username, kept current if
                it changes. Nothing else of theirs: not their name, not their
                picture, and nothing they have logged. Typing your own username
                is refused, and so is typing one another of your people is
                already linked to &mdash; the refusal names that person.{" "}
                <strong>What the account is told:</strong> nothing. No message
                is sent, and nothing in that account shows that anyone linked
                it. Linking changes what you see, not what they see or hold.
                Whoever runs this copy can see the link, because they can read
                the database on their own machine, which is true of everything
                on this page.
              </p>
              <p className="text-foreground mb-4">
                <strong>What your export carries:</strong> for each person you
                linked, the linked account&rsquo;s identifier on this copy
                &mdash; the same identifier that account&rsquo;s own export
                carries for itself. It also encodes when that account was
                created, to the millisecond, so a file you hand to somebody else
                tells them that too.
              </p>
              <p className="text-foreground mb-4">
                <strong>What an import can do:</strong> a file you import can
                link a person to the account on this copy its entry names by
                that identifier &mdash; not your own, and not one another of
                your people is already linked to &mdash; and the import&rsquo;s
                report names each account it links by its current username,
                which the file itself did not carry. So a logbook somebody else
                exported tells whoever imports it here the current usernames of
                the accounts its author linked. An identifier naming no account
                here is dropped, and that person arrives unlinked.
              </p>
              <p className="text-foreground mb-4">
                Since whether a username exists is something linking reveals,
                what bounds it is a limit on how many links one account may{" "}
                <em>attempt</em> in a quarter of an hour, typed or imported,
                counted with the other rate limits in section 2.2. Typing the
                username a person is already linked to again counts for nothing.
                Clearing the username, or deleting the person, removes the link
                at once. If the linked account is deleted, the link stays
                through its grace period, and once the account is erased every
                person linked to it is simply unlinked &mdash; the record you
                kept of them stays yours.
              </p>

              {/* Unconditional as well: every account on every copy can make a
                key, so Google takes a number after this one. */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.11 API Keys
              </h3>
              <p className="text-foreground mb-4">
                In Settings, under Authentication, you can make an API key: a
                secret that lets a script or a program of your own use this
                copy&rsquo;s API as you &mdash; to read your dives into a
                spreadsheet, say, or to log them from another tool. A key
                reaches your own account and no one else&rsquo;s, and making one
                shows nothing about you to anybody. This section is the whole of
                what a key does but one thing: a read-and-write key can propose
                a photo for a species, which shows something of yours to whoever
                runs this copy, and section 4.12 says what.
              </p>
              <p className="text-foreground mb-4">
                <strong>What a key can do:</strong> what its scope allows. A
                read-only key can read whatever your account can and change
                nothing; a read-and-write key can also add, change and delete
                what you could in the app, and propose a photo for a species,
                which neither app offers. Neither can make, list or revoke API
                keys, passkeys or signed-in devices, make a check-in link or an
                invite link, change the email address you sign in with, or
                delete your account &mdash; those need you signed in, in a
                browser or the OpenDiving app &mdash; and neither reaches
                anything only whoever runs this copy can. Whoever holds a key
                can use it from anywhere, so treat it like a password: anyone
                you give it to can pass it on.
              </p>
              <p className="text-foreground mb-4">
                <strong>For how long:</strong> until the expiry you chose when
                you made it &mdash; 30 days, 90 days, a year, or never &mdash;
                or until you revoke it on the API keys card, which stops it on
                its very next request. Signing out, or signing other devices
                out, leaves every key working. Asking to delete your account
                stops all of them.
              </p>
              <p className="text-foreground mb-4">
                <strong>What this copy keeps:</strong> a fingerprint of the key
                rather than the key itself, which is why it is shown to you
                once, when you make it, and never again; its first twelve
                characters, so the card and the emails can tell your keys apart
                without holding one; and the name you gave it, its scope, and
                when it was made, last used and expires. Making or revoking a
                key emails you and is one of the account security events in
                section 2.2; using one records nothing beyond its last-used
                date. Section 7 says when a key is deleted.
              </p>

              {/* Unconditional: a tool can propose a photo on every copy, so this
                takes a fixed number and Google moves after it. */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                4.12 Proposing a Photo for a Species
              </h3>
              <p className="text-foreground mb-4">
                A species&rsquo; photo is chosen by a rule this copy runs, and a
                tool can suggest a better one: a Wikimedia Commons file,
                proposed as the photo for a species, with a note saying why.
                Neither this site nor the OpenDiving app offers it. It is done
                through the API, by a tool holding a read-and-write API key of
                yours, as section 4.11 describes &mdash; a script that rates
                photographs, say. This is the fourth place in the software where
                something about one person is shown to another, the second that
                shows what you entered, and this section is the whole of it.
              </p>
              <p className="text-foreground mb-4">
                <strong>What the reviewer is shown:</strong> whoever runs this
                copy reviews photo proposals, from an administrator&rsquo;s
                account. They are shown the name on your account, never your
                address; the file; the note; and when it was proposed. No other
                diver is shown any of it.
              </p>
              <p className="text-foreground mb-4">
                <strong>What is sent where:</strong> proposing sends nothing
                anywhere &mdash; this copy checks only that the title looks like
                a picture file&rsquo;s. When the reviewer&rsquo;s screen shows
                your proposal, our servers ask Wikimedia Commons about that file
                &mdash; its size, licence, author and a small preview &mdash;
                and when the reviewer accepts it, they download the picture, as
                section 4.6 describes for every species photo. What Commons
                receives is the file&rsquo;s title, the one your tool proposed:
                nothing about you or your account goes with it, and it is sent
                by our servers rather than by a browser, so Wikimedia sees
                neither your IP address nor the reviewer&rsquo;s.
              </p>
              <p className="text-foreground mb-4">
                <strong>What happens to it:</strong> an accepted file becomes
                the species&rsquo; photo, which every account here sees,
                credited as Commons credits it and never to you. A declined one
                is never waiting for that species again, whoever proposes it,
                and the reviewer may give a reason. A proposal still waiting
                when whoever runs this copy chooses the species&rsquo; photo
                some other way is closed, which says nothing about the file.
                Proposing for the same species again replaces your waiting one.
                No email is sent about a proposal: your tool reads what became
                of it through the API, and can withdraw one that waits there
                too; neither app has a button for either. Photo proposals are
                limited per account per day, counted with the other rate limits
                in section 2.2.
              </p>
              <p className="text-foreground mb-4">
                <strong>What this copy keeps:</strong> the proposal &mdash; the
                species, the file, the note, whether it waits or was accepted,
                declined, withdrawn or closed, any reason, and when. It is tied
                to your account and never published, and it is not in the
                export: your tool lists your proposals and what became of each,
                and a copy of the rest is asked for as section 6.2 says. It goes
                when your account goes, whatever became of it. A declined one is
                what keeps its file from waiting for that species again, and
                goes with your account like the rest.
              </p>

              {googleClientId && (
                <>
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    4.13 Signing In with Google
                  </h3>
                  <p className="text-foreground mb-4">
                    This copy of OpenDiving offers &ldquo;Continue with
                    Google&rdquo;, and until you press that button nothing about
                    you reaches Google. Opening the front page or the sign-in
                    page loads no code of Google&rsquo;s, contacts no Google
                    address, and gives Google no opportunity to set anything in
                    your browser. If you sign in another way, or never sign in
                    at all, Google is never told you were here.
                  </p>
                  <p className="text-foreground mb-4">
                    Pressing the button takes you to Google, because that is
                    what signing in with Google means. From that point you are
                    on Google&rsquo;s own site, under{" "}
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-muted-foreground"
                    >
                      its own privacy policy
                    </a>
                    , which this copy of OpenDiving neither controls nor can
                    see. Anything Google stores there is its own, on its own
                    address, rather than a third-party cookie on this one. You
                    choose there whether to go through with it, and if you
                    change your mind Google returns you here with nothing having
                    happened.
                  </p>
                  <p className="text-foreground mb-4">
                    What comes back to your browser is a single-use code and
                    nothing else. It is this server, not your browser, that
                    hands that code to Google in exchange for confirmation of
                    who you are &mdash; a call made server to server, which is
                    why nothing identifying you passes through your browser at
                    any point. This copy stores no Google credential of any
                    kind: it never asks Google for the sort of token that would
                    let it act as you later, and the code and the one-time
                    secret your browser kept to match it are both used once and
                    discarded.
                  </p>
                  <p className="text-foreground mb-4">
                    If you do sign in with Google, Google learns that you use
                    this copy of OpenDiving. And if that is the moment your
                    account is created, your Google profile picture is copied
                    onto this instance and becomes your avatar &mdash; once, at
                    account creation, and never again. Signing in with Google
                    later does not fetch it a second time, because by then the
                    picture is yours to change.
                  </p>
                  <p className="text-foreground mb-4">
                    An operator who would rather not offer this at all can leave
                    Google sign-in unconfigured, and then none of this &mdash;
                    including this section &mdash; exists on their copy at all.
                  </p>
                </>
              )}

              {/* Conditional like Google's, and after it, so its number is the
                  next one whichever of the two this copy has. */}
              {diveConditions && (
                <>
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    4.{googleClientId ? 14 : 13} Weather at Your Dives
                  </h3>
                  <p className="text-foreground mb-4">
                    This copy of OpenDiving fills in the weather for the dives
                    you log. Some time after you save a dive that has a place
                    &mdash; a dive site&rsquo;s pin, or a position your dive
                    computer recorded &mdash; our servers ask{" "}
                    <a
                      href="https://open-meteo.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-muted-foreground"
                    >
                      Open-Meteo
                    </a>
                    , a public weather service, what the weather was there and,
                    for a dive in the sea, the waves and the tide. What is sent
                    is the position rounded to about a kilometre and the dates
                    around the dive, at most three days and never an hour.
                    Nothing identifying you or the dive goes with it, and it is
                    sent by our servers rather than by your browser, so
                    Open-Meteo never sees your IP address. Answers are cached,
                    so a second dive at the same place on the same days sends
                    nothing more.
                  </p>
                  <p className="text-foreground mb-4">
                    The answer fills a dive&rsquo;s air temperature, weather and
                    waves only where you left them empty, and the dive page
                    marks each one it filled. Choosing another value replaces
                    it, and the value you chose is never overwritten.
                  </p>
                  <p className="text-foreground mb-4">
                    An operator who would rather not use this leaves it switched
                    off, and then nothing is sent and this section does not
                    exist on their copy.
                  </p>
                </>
              )}

              {/* Conditional like the two above and after them, and the terms' grant names
                  it by its heading, since that page reads neither of theirs. */}
              {commonsPrimary && (
                <>
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    4.{proposingSection} Proposing for OpenDiving Commons
                  </h3>
                  <p className="text-foreground mb-4">
                    OpenDiving Commons is edited on this copy. A dive site of
                    yours can be offered to it with{" "}
                    <em>Propose for OpenDiving Commons</em>, which the form that
                    adds or edits a site of yours offers to start as you save
                    it, and which is on the site&rsquo;s own page too; a Commons
                    site can be corrected with <em>Propose a change</em> on its
                    page. Both go one site at a time, and neither goes anywhere
                    until you tick the words it shows you and send it. This is
                    the fifth place in the software where something about one
                    person is shown to another, the third that shows what you
                    entered, and the only one that publishes anything, and this
                    section is the whole of it.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What a reviewer is shown:</strong> whoever runs this
                    copy reviews proposals, from an administrator&rsquo;s
                    account. They are shown the name on your account, never your
                    address; how many of your proposals have been accepted and
                    declined; the message you added, if you added one; and the
                    site&rsquo;s shared facts &mdash; its name and other names,
                    its pin, the name of its locality, its entries in registries
                    such as OpenStreetMap, its depths, its water, its altitude
                    and how divers get in. For a site of your own the proposal
                    follows the site&rsquo;s edits while it waits, so an edit
                    you make meanwhile is what is in front of them. Never your
                    notes, your tags or your dives, and no other diver is shown
                    any of it.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What is published:</strong> if a reviewer accepts,
                    the record, and only the record: those shared facts as the
                    reviewer settled them, with the pin at six decimal places
                    and the locality as a name alone, and the site&rsquo;s
                    identifier, which it keeps and which encodes when you
                    created the site, to the millisecond. A change publishes the
                    new values on the record it changes. Who proposed it is
                    never published: no name, no address and no account goes
                    with it. A site of yours that is accepted stops being yours,
                    and every account here can use it; your notes, tags and
                    dives on it stay yours, as section 4.2 says. Where the
                    Commons already has the site, the reviewer may accept yours
                    into that record instead: your dives, notes and tags move to
                    the record and your own site is removed, though its
                    identifier is kept with your account, pointing at the
                    record, until your account goes.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>Who can read it:</strong> anyone. This copy serves
                    every Commons record at a public address, with no account
                    needed, and they are copied to a{" "}
                    <a
                      href="https://github.com/opendiving/opendiving-commons"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-muted-foreground"
                    >
                      public repository on GitHub
                    </a>
                    , whose history keeps what it has held. Other copies of
                    OpenDiving carry the records too, and anyone may take them
                    from there.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What you give up:</strong> the words you tick say
                    that what you propose is from your own diving and not copied
                    from elsewhere, and dedicate it to the public domain under{" "}
                    <a
                      href="https://creativecommons.org/publicdomain/zero/1.0/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-muted-foreground"
                    >
                      CC0 1.0
                    </a>
                    . What is accepted is anyone&rsquo;s, for any purpose, and
                    it stays: removing it from your sites or deleting your
                    account leaves it where it is. A change accepted into a
                    record that came from another source leaves that record
                    under its source&rsquo;s licence.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What this copy keeps privately:</strong> the
                    proposal &mdash; what you asked for, the words you ticked
                    and when, your message, whether it waits or was accepted,
                    declined or withdrawn, and any reason. It is tied to your
                    account and is never published. It is kept so that it can be
                    reviewed and answered, so that you can see what became of
                    it, and as the evidence that you made the dedication. It
                    goes when your account goes, whatever became of it, and
                    section 7 has the rest of how long it stays.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What happens to it:</strong> while it waits,
                    everyone goes on seeing the site as it is, and you can
                    withdraw it from the site&rsquo;s page or from{" "}
                    <em>Your proposals</em> on the Sites page. A proposal that
                    is declined or withdrawn publishes nothing. A decline always
                    comes with a reason, which the reviewer writes and you read
                    on the site until you propose again, and in your list of
                    proposals. No email is sent about a proposal; the answer
                    waits for you in those two places. Proposals are limited per
                    account per day, counted with the other rate limits in
                    section 2.2. A tool of yours holding a read-and-write API
                    key can send one as you, and the words it sends are yours as
                    much as a tick would be.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>What you can ask:</strong> the rights in section 6.2
                    apply to a proposal as to anything else here. Your list
                    shows each one&rsquo;s outcome and reason; for a copy of the
                    rest, or to have one corrected or deleted, ask whoever runs
                    this copy, as section 13 says. An accepted record is a
                    different matter, because it carries nothing that names you
                    and it is no longer yours to withdraw: deleting the proposal
                    behind it leaves it public.
                  </p>
                  <p className="text-foreground mb-4">
                    <strong>Reporting a record:</strong> anyone, with an account
                    or without, can report a Commons record &mdash; a pin that
                    shows more than it should, a wrong name, something that
                    should not be there &mdash; to whoever runs this copy, by
                    the way section 13 gives. A report is answered by changing
                    the record, a reviewer coarsening the pin or changing the
                    name. A record cannot yet be removed.
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
                  field anywhere, and no password is stored, because none is
                  ever set. You sign in with a link or a code sent to your
                  email, with a passkey, or &mdash; where an instance offers it
                  &mdash; with Google. A tool of your own uses an API key
                  instead, which signs nothing in and is shown to you once
                  &mdash; section 4.11
                </li>
                <li>
                  <strong>Single-use sessions:</strong> The cookie that keeps
                  you signed in is spent and replaced on every use. A spent one
                  presented again within about a minute is answered as the retry
                  it almost always is &mdash; a reply lost on a bad connection
                  &mdash; and past that it is treated as a stolen session rather
                  than a mistake. Each session is also a record on the server
                  rather than only a token in your browser, which is what lets
                  you see the devices signed in to your account and sign one of
                  them out from another &mdash; section 6.1
                </li>
                <li>
                  <strong>Nothing sensitive in browser storage:</strong> The
                  short-lived token that authorises each request is held in
                  memory and never written to storage at all, so a script
                  running on the page has nothing to read. Section 10 is the
                  full list of what is written
                </li>
                <li>
                  <strong>Open to review:</strong> The source is public, so
                  these claims can be checked rather than taken on trust, and
                  security reports are welcome
                </li>
              </ul>
              <p className="text-foreground mb-4">
                What the software cannot promise on an operator&rsquo;s behalf:
                whether traffic to this copy is encrypted in transit, whether
                the disks it sits on are encrypted at rest, who has
                administrative access to the machine, and whether backups exist
                and where they go. Those are properties of a deployment, not of
                a program, and they belong to whoever runs this one. The
                self-hosting documentation tells operators how to get the first
                of them right; it cannot make them.
                {projectOperated && (
                  <>
                    {" "}
                    On this copy all four are answered rather than declined,
                    under <em>Who Runs This Copy</em> at the top of this page.
                  </>
                )}
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
                From Settings and the Import page, without asking anyone, you
                can:
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>Update your profile and account information</li>
                <li>Change the email address you sign in with</li>
                <li>
                  See every device signed in to your account, and sign any of
                  them out
                </li>
                <li>
                  Make an API key for a tool of your own, see what each one may
                  do and when it was last used, and revoke it
                </li>
                <li>
                  Where this copy is invite-only, invite someone, make, reset or
                  remove your invite link, see the invitations you have sent and
                  who joined through your link, and take back one that has not
                  been used
                </li>
                <li>
                  {commonsPrimary
                    ? "Export what you have entered, all but your photo proposals and your proposals for OpenDiving Commons"
                    : "Export what you have entered, all but your photo proposals"}
                </li>
                <li>
                  Bring a logbook back in &mdash; a file this app exported, or
                  files from a dive computer or another program, as many at once
                  as you have, seeing what they would do before anything is
                  written
                </li>
                <li>
                  {commonsPrimary
                    ? "Delete your account and what is attached to it, which leaves any record accepted into OpenDiving Commons"
                    : "Delete your account and everything attached to it"}
                </li>
              </ul>
              <p className="text-foreground mb-4">
                There are no privacy settings for your dive logs, and their
                absence is the point:{" "}
                {commonsPrimary
                  ? "what you log is neither public nor shared unless you propose it, so there is nothing to switch off. What does have a switch is a check-in link you made, which"
                  : "nothing you log is public or shared, so there is nothing to switch off. The exceptions are a check-in link you made, which"}{" "}
                Revoke on your check-in page switches off at once &mdash;
                section 4.9; where this copy is invite-only, your invite link,
                which Remove on the Invitations card switches off at once
                &mdash; section 4.8; an API key you made, which Revoke on the
                API keys card switches off at once &mdash; section 4.11;{" "}
                {!commonsPrimary && "and "}a photo proposal that waits, which
                only a tool can withdraw, through the API &mdash; section 4.12
                {commonsPrimary && (
                  <>
                    ; and a proposal that waits, which Withdraw on the site or
                    in your list of proposals takes back at once &mdash; section
                    4.{proposingSection}. A proposal already accepted has no
                    switch: it is public, and it stays
                  </>
                )}
                .
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
                  format &mdash; and read it back into another copy of this app,
                  which is the half that makes the format worth having. Your
                  dive drafts ride in the full archive but are not read back
                </li>
                <li>
                  <strong>Objection:</strong> Object to certain processing of
                  your data
                </li>
                <li>
                  <strong>Restriction:</strong> Request limitation of data
                  processing
                </li>
              </ul>
              <p className="text-foreground mb-4">
                The first four need no request: access, correction, deletion and
                portability are all buttons in Settings, and they act
                immediately rather than being forwarded to somebody.{" "}
                {outsideTheButtons} things sit outside those buttons, and naming
                them is better than letting that sentence read wider than it is.
                The email address you sign in with, your username, the list of
                signed-in devices and your API keys are in Settings but are not
                part of the export: they are your account on this copy rather
                than your logbook, and the username only names the file you
                download.
                {mapTiles && (
                  <>
                    {" "}
                    Nor are the map tiles section 4.4 says this copy draws, and
                    deleting your account leaves them too: they are not yours.
                    Each is drawn from the map alone, with nothing of yours in
                    it, and is kept while anyone on this copy is shown it and
                    for 30 days after.
                  </>
                )}{" "}
                And three records in section 2.2 are in neither, the account
                security events, the retry records and the identifiers of
                replaced sites: nothing in the app shows them to you and no
                button copies them, so a copy of any of them has to be asked for
                like the rights below.
                {commonsPrimary && (
                  <>
                    {" "}
                    Nor is a proposal for OpenDiving Commons in the export: your
                    list of proposals shows what became of each, and a copy of
                    the rest has to be asked for in the same way, as section 4.
                    {proposingSection} says.
                  </>
                )}{" "}
                Nor is a photo proposal: a tool of yours can list each one and
                what became of it through the API, and a copy of the rest has to
                be asked for in the same way, as section 4.12 says. The last
                two, that request, and anything else go to whoever runs this
                copy &mdash; section 13 says how to reach them.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                6.3 Communication Preferences
              </h3>
              <p className="text-foreground mb-4">
                This copy of OpenDiving sends you three kinds of email, and the
                whole list is here. (It also delivers a support-form message to
                whoever runs this copy, which is mail about you rather than to
                you.)
              </p>
              <p className="text-foreground mb-4">
                <strong>Emails that follow an action on this site:</strong> the
                sign-in message, which carries both a link and a code; the
                message confirming a new email address, sent to that new
                address; the message confirming that you asked to delete your
                account; and, where this copy is invite-only, the message
                telling an address that somebody here has invited it. None of
                these can be switched off without breaking the thing they are
                part of.
              </p>
              <p className="text-foreground mb-4">
                Only one of those four is sent to your account&rsquo;s own
                address &mdash; the deletion confirmation. The other three go to
                whatever address was typed, and it is worth being straight about
                what that means. Signing in needs no account, so anyone who
                types your address into this copy causes a sign-in message to be
                sent to you &mdash; which is why that message tells you to
                ignore it if it was not you, and why the link and code expire
                quickly and work only once. The address-confirmation message is
                the same shape: it goes to whatever new address a signed-in
                diver typed, for the express purpose of proving they can read
                it. Neither of those two is something the recipient can prevent,
                because the alternative is a sign-in flow that cannot start. The
                invitation goes to whatever address somebody with an account
                here invited, and names them so you know who; it is not
                preventable either, but for a different reason and it is worth
                being exact about which. Nothing turns on its arrival &mdash;
                the address is admitted the moment the invitation is made, so
                the message is a courtesy rather than a step, and the person who
                invited you could as easily have told you by other means. What
                makes it unpreventable is that this copy has no way to know,
                before sending, that an address would rather not hear from it.
                What bounds it instead is the limit in section 4.8 on how many
                invitations one account may make, by address or through its
                invite link.
              </p>
              <p className="text-foreground mb-4">
                Being sent to your own address is not the same as being sent
                because <em>you</em> acted, and this page will not blur the two.
                Deleting your account, adding or removing a passkey, and making
                or revoking an API key each email your account&rsquo;s address
                on the strength of a live session and nothing more &mdash; no
                re-checking that it is really you. So if somebody else had hold
                of your session, the message still arrives at you, about
                something you did not do. That is precisely why the notices in
                the next group exist and cannot be switched off.
              </p>
              <p className="text-foreground mb-4">
                <strong>
                  Security notices, which arrive because your account changed
                  &mdash; whether or not it was you who changed it:
                </strong>{" "}
                when a passkey is added to your account, and when one is
                removed; when an API key is made for it, and when one is
                revoked. And when your email address is changed, a note goes to
                the <em>old</em> address naming the new one. That last one
                exists precisely so that the owner of an address finds out even
                if they were not the person who changed it, which is why it
                cannot be switched off: an alert you can silence is not an
                alert.
              </p>
              <p className="text-foreground mb-4">
                <strong>Three scheduled emails</strong>, each under its own
                condition.
              </p>
              <p className="text-foreground mb-4">
                <em>Gear service.</em> If you set a service schedule on a piece
                of gear you have not archived, this copy will email you when
                that service comes due. It is not a drumbeat: one email when
                something enters &ldquo;due soon&rdquo;, one when it goes
                overdue, and then &mdash; because a schedule left overdue would
                otherwise go quiet forever &mdash; a reminder every three months
                for as long as it stays overdue. Logging the service, or
                changing the interval, starts the cycle over. Gear with no
                schedule on it, or gear you have archived, is never mentioned.
              </p>
              <p className="text-foreground mb-4">
                <em>Renewals.</em> If a certification you have entered, or an
                insurance policy in your check-in details, has an expiry date,
                this copy will email you once when that date is{" "}
                {CERTIFICATION_EXPIRING_SOON_DAYS} days away or closer, and once
                more when it has passed. Everything that reaches either point at
                the same time goes in one email. There is no reminder after
                that: a card or policy left expired stays in your notifications,
                but is not emailed about again. Entering a new expiry date
                starts the cycle over. A card or policy with no expiry date is
                never mentioned.
              </p>
              <p className="text-foreground mb-4">
                <em>Your year in review.</em> During January, this copy will
                email you the year before in figures, taken from your own log:
                how many dives and how long underwater, your deepest and longest
                dives with the date of each and its dive site where it has one,
                how many dive sites, and how many species you logged and how
                many of those were new to you. It is sent once for each year,
                and not at all for a year in which you logged no dives.
              </p>
              <p className="text-foreground mb-4">
                All three are on by default: a reminder nobody switched on never
                arrives, and the point of each is reaching you when you are not
                in the app. Each has its own switch in Settings, under
                Notifications, and turning one off stops that kind and leaves
                the other two as they are.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Data Retention
              </h2>
              <p className="text-foreground mb-4">
                {commonsPrimary
                  ? "What you have entered is kept for as long as your account exists, and what is accepted into OpenDiving Commons for longer. That is what"
                  : "While your account exists, what you have entered is kept. That is what"}{" "}
                a dive log is for &mdash; a logbook that quietly discarded your
                older dives would be the wrong product.
              </p>
              <p className="text-foreground mb-4">
                Three of the records in section 2.2 expire on their own, whether
                or not you delete anything, because none is anything you
                entered. A <strong>signed-in device&rsquo;s session</strong> is
                deleted after it stops being able to sign you in: one that went
                unused long enough to lapse goes within the hour, and one that
                ended before that &mdash; you signed that device out, or signed
                out on it &mdash; is kept until the end of the day it was last
                used, midnight UTC, so that it still counts in that day&rsquo;s
                total of active accounts, and goes within the hour after. And
                the <strong>account security events</strong> are swept on a
                schedule &mdash; entries tied to an account after 90 days, and
                entries that name only an email address, from before any account
                existed, after 7 days. That shorter one is deliberately the same
                short life the sign-in link&rsquo;s own record already has: an
                address someone typed into this copy and never came back to
                should not outlive it here. A <strong>retry record</strong> is
                deleted by an hourly sweep once it is as old as the longest an
                OpenDiving app&rsquo;s session can sit unused &mdash; about
                three months, the window section 10.1 describes &mdash; so that
                something the app sends again days after a lost reply still
                finds it.
              </p>
              <p className="text-foreground mb-4">
                An <strong>import</strong> expires on its own too, if whoever
                runs this copy has set a limit. Its held files go when you apply
                or discard it, or at that limit if you do neither, and the
                import goes with them. An import you applied keeps its review
                and log, without the files, until the retention set here runs
                out or you delete it from the Import page.
              </p>
              <p className="text-foreground mb-4">
                Two more expire on their own where this copy is invite-only, and
                both hold an address belonging to somebody who may have no
                account here at all. A <strong>request to be invited</strong> is
                kept for up to 90 days from when it was made, and goes sooner if
                whoever runs this copy invites the address or removes the
                request, or if an account is created with that address. An{" "}
                <strong>invitation nobody has used</strong> is kept for up to 90
                days from when it was sent, whether or not it was taken back
                before then; after that the address is refused again until
                somebody invites it afresh. An invitation that <em>was</em> used
                is not swept, because by then it belongs to two accounts and
                goes when either of them does.
              </p>
              <p className="text-foreground mb-4">
                A <strong>check-in link</strong> is deleted by a sweep that runs
                every hour once it has stopped working: 24 hours after you made
                it, or sooner if you revoked it or made another.
              </p>
              <p className="text-foreground mb-4">
                Where this copy is invite-only, an <strong>invite link</strong>{" "}
                does not expire: it is kept until you reset or remove it, or
                your account goes. An invitation made through one is used from
                the start, so it is never swept either, and goes when either
                account does.
              </p>
              <p className="text-foreground mb-4">
                An <strong>API key</strong> is not swept either. It is kept,
                expired or not, until you revoke it or your account goes; an
                expired one stays on the API keys card, marked, so that removing
                it is yours to do.
              </p>
              <p className="text-foreground mb-4">
                The <strong>identifier of a replaced site</strong> has no expiry
                of its own. Replacing a dive site of yours with a Commons site
                removes the site, and its identifier stays with your account,
                pointing at the record, until your account goes.
              </p>
              <p className="text-foreground mb-4">
                A <strong>photo proposal</strong> is not swept either. It is
                kept, whatever became of it, until your account goes; a declined
                one is what keeps its file from waiting for that species again.
                A photo accepted from one stays as the species&rsquo; photo
                after that, being the species&rsquo; and not yours.
              </p>
              {commonsPrimary && (
                <p className="text-foreground mb-4">
                  A <strong>proposal for OpenDiving Commons</strong> is not
                  swept either. It is kept, whatever became of it, until your
                  account goes, and one on a dive site of your own goes sooner
                  if that site is deleted or replaced with a Commons site, whose
                  identifier alone stays, as the paragraph above says. A{" "}
                  <strong>record accepted into the Commons</strong> is kept for
                  as long as the Commons is, whatever becomes of your account:
                  it belongs to no account, and section 4.{proposingSection}{" "}
                  says what it carries.
                </p>
              )}
              {mapTiles && (
                <p className="text-foreground mb-4">
                  The <strong>map tiles</strong> this copy draws, which section
                  4.4 describes, are kept with its files. They are drawn from
                  the map alone and shared by everyone this copy shows that part
                  of the world in the same language, so they belong to no
                  account and are not deleted with one: a tile this server has
                  not been asked for in 30 days is deleted, and drawn again if a
                  map asks for it after that.
                </p>
              )}
              <p className="text-foreground mb-4">
                The <strong>daily totals</strong> in section 2.2 are kept for as
                long as this copy runs, and deleting an account does not lower
                them: each is a count of what happened on one day rather than a
                record about anyone, and a total that shrank when somebody left
                would no longer say what happened that day.
              </p>
              <p className="text-foreground mb-4">
                When you delete your account:
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>
                  It first goes into a short grace period, during which signing
                  in again brings it back intact. The email confirming the
                  deletion says when that period ends
                </li>
                <li>
                  Personal information is permanently deleted within 30 days
                </li>
                <li>
                  The deletion is not a flag or an archive: the account row and{" "}
                  {commonsPrimary
                    ? "what belongs to it"
                    : "everything hanging off it"}{" "}
                  &mdash; dives, dive drafts, sites, trips, gear, courses,
                  certifications, contacts, people, tags &mdash; are destroyed,
                  and the files you uploaded are unlinked from disk with them. A
                  Commons site you saved stays, being no account&rsquo;s, and
                  your notes and tags on it go
                  {commonsPrimary &&
                    ". A site or a change of yours that was accepted into OpenDiving Commons stays too, having stopped being yours when it was accepted"}
                </li>
                <li>
                  Your photo proposals go with it, whatever became of them. One
                  still waiting leaves the review as soon as you ask to delete
                  the account, and comes back if you bring the account back and
                  the species&rsquo; photo has not been settled meanwhile
                </li>
                {commonsPrimary && (
                  <li>
                    Your proposals for OpenDiving Commons go with it, whatever
                    became of them. One still waiting leaves the
                    reviewer&rsquo;s queue as soon as you ask to delete the
                    account, and comes back if you bring the account back
                  </li>
                )}
                <li>
                  Any invitations you sent go with it, used or not, and so does
                  your invite link. Somebody you invited who has not created an
                  account yet loses the invitation and would have to be invited
                  again by someone else. Any invitation or pending request
                  naming <em>your</em> address is found by that address and
                  removed as well
                </li>
                <li>
                  Every person another diver linked to your account is unlinked.
                  Their record of that person stays theirs, and from then on
                  shows no username
                </li>
                <li>
                  Your sessions, your API keys, your retry records and your
                  account security events go with it. The entries made before
                  the account existed have nothing linking them to it, so they
                  are found by the email address instead &mdash; the same way
                  the sign-in records already are. The one gap that cannot
                  close: entries left under an address you later moved off are
                  not named by the deletion, and expire on their own 7-day
                  schedule instead
                </li>
              </ul>
              <p className="text-foreground mb-4">
                {commonsPrimary
                  ? "Apart from the daily totals above and the records accepted into OpenDiving Commons, neither of which names you, nothing is kept for"
                  : "Apart from the daily totals above, which name nobody, nothing is held back for"}{" "}
                &ldquo;legitimate business purposes&rdquo;; there is no business
                here to have them. Two honest caveats remain, and both belong to
                the deployment rather than to the software: whatever backups the
                operator keeps are theirs to expire, and a deletion cannot reach
                into a backup already written; and an operator under a legal
                obligation to preserve something is subject to it whatever this
                page says.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Where Your Data Lives
              </h2>
              <p className="text-foreground mb-4">
                Your data lives on this instance, and where that is, is a fact
                about its operator&rsquo;s deployment.{" "}
                {commonsPrimary ? (
                  <>
                    There is no network of servers behind it, and nothing of
                    your account leaves it. What does is the OpenDiving Commons
                    records section 4.{proposingSection} describes, which anyone
                    anywhere can fetch and which are copied to a public
                    repository on GitHub, a service run from the United States.
                    Otherwise one copy of OpenDiving
                  </>
                ) : (
                  "There is no network of servers behind it and no transfer between countries built into the software: one copy of OpenDiving"
                )}{" "}
                is one database and one files volume, wherever the person
                running it chose to put them.
                {mapTiles && (
                  <>
                    {" "}
                    The files volume also holds the map tiles this copy draws,
                    which are drawn from the map alone and are nobody&rsquo;s,
                    deleted once 30 days pass without one being shown, as
                    section 7 says.
                  </>
                )}
              </p>
              <p className="text-foreground mb-4">
                If that matters to you &mdash; and under some data-protection
                laws it does &mdash; the operator is who can tell you, and
                section 13 says how to ask. If you run the copy yourself, the
                answer is your own machine.
                {projectOperated && (
                  <>
                    {" "}
                    On this copy you need ask nobody:{" "}
                    <em>Who Runs This Copy</em> at the top of this page names
                    the region the database and the files sit in.
                  </>
                )}
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Children's Privacy
              </h2>
              <p className="text-foreground mb-4">
                OpenDiving is not intended for children under 13, and this copy
                does not knowingly collect personal information from anyone
                under 13. If its operator becomes aware that it has, deleting
                the account removes it.
              </p>
              <p className="text-foreground mb-4">
                Divers between 13 and 18 should have a parent&rsquo;s agreement
                before using the Service, particularly given what it is a log
                of.
              </p>
              {projectOperated && (
                <p className="text-foreground mb-4">
                  Those two sentences are the software&rsquo;s floor, and an
                  operator may be held to a higher one. This copy is: its
                  minimum age is 16, for the reason given under{" "}
                  <em>Who Runs This Copy</em> at the top of this page.
                </p>
              )}
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. What Is Stored in Your Browser
              </h2>
              <p className="text-foreground mb-4">
                Two kinds of thing: one cookie that keeps you signed in, and a
                short list of preferences remembered on this device. None of it
                is advertising or analytics, which is why this page has no
                cookie banner for you to click through &mdash; there is nothing
                here to ask you to accept.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                10.1 The Sign-in Cookie
              </h3>
              <p className="text-foreground mb-4">
                One cookie, named <StorageKey name="refresh_token" />, and in
                normal operation it is the only one this software sets. It is
                what keeps you signed in. Your browser will not let scripts on
                the page read it, it is sent only back to this site, and by
                default it is marked so that it travels only over an encrypted
                connection.
              </p>
              <p className="text-foreground mb-4">
                It is single-use: each time it is spent a fresh one replaces it,
                with the clock started again. So the window rolls rather than
                running out on a fixed date &mdash; signing in keeps you signed
                in on this browser until about a week goes by without you using
                the app, not for a week from when you signed in. So a browser
                you keep using stays signed in for as long as nothing ends its
                session, and the next paragraph is what can. The OpenDiving app
                on a phone asks for a longer window when it signs in, and stays
                signed in until about three months go by without it being used;
                a browser is never given that one. &ldquo;About a week&rdquo;
                and &ldquo;about three months&rdquo; are the standard settings,
                and the operator of this copy can change either.
              </p>
              <p className="text-foreground mb-4">
                It is cleared when you sign out and when your account is
                deleted. It also stops being accepted when the session behind it
                is ended somewhere else: signing that device out from the list
                in Settings, using &ldquo;Sign out other sessions&rdquo; there,
                or &mdash; on an account with an improbable number of devices
                signed in at once &mdash; this copy dropping the least recently
                used one to make room. In each of those the browser is signed
                out at once: the short-lived token described below stops being
                accepted from the same instant, so the next thing that browser
                asks this server for sends it to the sign-in page. A spent
                cookie turning up again within about a minute is answered as the
                retry it almost always is, and past that is treated as a stolen
                session. For that minute this server keeps the cookie it issued
                in the spent one&rsquo;s place, with the token that goes with
                it, to hand to the retry, and then discards it &mdash; nothing
                of it is written to the database.
              </p>
              <p className="text-foreground mb-4">
                The token that actually authorises each request is deliberately
                never written to your browser&rsquo;s storage. It is held in the
                tab&rsquo;s memory, dies when you close the tab, and is worked
                out again from the cookie above the next time you open the app.
                That is the reason the rest of this list is so short.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                10.2 Preferences Remembered on This Device
              </h3>
              <p className="text-foreground mb-4">
                {googleClientId ? "Ten" : "Nine"} entries in your
                browser&rsquo;s local storage. Every one of them is read only by
                the page you are on: none is sent to this server, and none is
                sent anywhere else. Where a row below says how long an entry is
                kept, read it as &ldquo;unless you tell this browser to stop
                remembering&rdquo; &mdash; 10.3 is the switch that does that,
                and says which of these it reaches.
              </p>
              <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
                <li>
                  <StorageKey name="theme" /> &mdash; whether you picked light,
                  dark, or whatever your system is set to. Kept until you change
                  it
                </li>
                <li>
                  <StorageKey name="opendiving:post-auth-redirect" /> &mdash;
                  where to send you after you click a sign-in link, since the
                  link is opened from your mail app and lands on a page that has
                  no other way to know. It expires after 24 hours, is cleared
                  when you sign out, and is read once and removed. It can hold
                  an in-app address such as a particular dive&rsquo;s page,
                  which anyone else at this browser could read &mdash; which is
                  exactly why it does not linger
                </li>
                {googleClientId && (
                  <li>
                    <StorageKey name="opendiving:google-sign-in-attempts" />{" "}
                    &mdash; the one-time secret that proves a &ldquo;Continue
                    with Google&rdquo; sign-in coming back from Google is the
                    one you started here, along with where you were headed
                    {joinLinks ? (
                      <>
                        {" "}
                        and, if you came by a join link or a member&rsquo;s
                        invite link, which one
                      </>
                    ) : (
                      <>
                        {" "}
                        and, where this copy is invite-only and you came by a
                        member&rsquo;s invite link, which link
                      </>
                    )}
                    . Written only when you press that button, one entry per
                    attempt so that two tabs cannot spoil each other&rsquo;s,
                    read once and removed the moment Google returns you, and
                    expiring after 30 minutes if it never does
                  </li>
                )}
                <li>
                  <StorageKey name="opendiving:passkey-nudge-dismissed" />{" "}
                  &mdash; that you dismissed the offer to add a passkey on this
                  browser. Kept until you undo that from the passkeys card in
                  your settings
                </li>
                <li>
                  <StorageKey name="opendiving:dive-profile-series-v5" />{" "}
                  &mdash; which lines you last had showing on a dive profile
                  chart. Kept until you change them
                </li>
                <li>
                  <StorageKey name="opendiving:gas-use-series" /> &mdash; the
                  same for the gas-use chart. Kept until you change them
                </li>
                <li>
                  <StorageKey name="opendiving:dive-activity-view" /> &mdash;
                  which period Home&rsquo;s activity chart is showing. Along
                  with the period it holds a date to anchor it, worked out from
                  the dates of your own dives, so this one is derived from your
                  data rather than being only a setting. Kept until you change
                  it
                </li>
                <li>
                  <StorageKey name="opendiving:gas-use-view" /> &mdash; the same
                  for the gas-consumption card, with the same anchor date. Kept
                  until you change it
                </li>
                <li>
                  <StorageKey name="opendiving:entry-units" /> &mdash; which
                  units you would rather type in, per field, so that a rented
                  cylinder gauge in psi does not make you convert in your head.
                  Cleared when you sign out, so that the next person at this
                  browser is not handed your choice
                </li>
                <li>
                  <StorageKey name="opendiving:device-memory-opt-out" /> &mdash;
                  that you used the switch in 10.3 to say this browser should
                  stop remembering your display preferences. 10.3 lists exactly
                  which of the entries above that reaches. This is the one entry
                  here that exists because you asked for it, and the only way
                  this browser can keep honouring that answer after you close
                  the tab. Kept until you turn the switch back off
                </li>
              </ul>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                10.3 Telling This Browser to Stop Remembering
              </h3>
              <p className="text-foreground mb-4">
                Changing a preference is not the same as declining to have one
                stored, and under some rules &mdash; UK law is the clearest case
                &mdash; storage of this kind owes you a simple way to object to
                the storage itself rather than to the value. Here is that way.
                It applies to this browser, it costs nothing, and you do not
                need an account to use it.
              </p>
              <DeviceMemorySwitch />
              <p className="text-foreground mb-4 mt-4">
                Seven of those {googleClientId ? "ten" : "nine"} are covered:{" "}
                <StorageKey name="theme" />, both chart-line entries, both
                chart-period entries,{" "}
                <StorageKey name="opendiving:entry-units" /> and{" "}
                <StorageKey name="opendiving:passkey-nudge-dismissed" />.
                Turning the switch on deletes each of them that exists and
                refuses the next write of any of them. It also sweeps out
                anything else this site left behind under the same{" "}
                <StorageKey name="opendiving:" /> naming, including entries
                older versions of this software wrote and nothing reads any
                more. Turning it back off restores nothing &mdash; the stored
                values were what you objected to &mdash; it only lets later
                choices be remembered again.
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
                    itself &mdash; read once and gone, and expiring on its own
                    if you never come back.
                  </>
                ) : (
                  <>
                    is what carries a sign-in you started here across the hop
                    through your mail app, and it removes itself &mdash; read
                    once and gone, and expiring on its own if you never come
                    back.
                  </>
                )}{" "}
                And the switch&rsquo;s own entry stays, because an objection
                this browser forgot the moment you closed the tab would not be
                one.
              </p>
              <p className="text-foreground mb-4">
                Clearing your browser&rsquo;s data for this site removes all of
                them too, and we would still rather not dress that up as a
                control we give you. It is your browser&rsquo;s, not ours; it
                cannot single one of these out; and it also destroys the sign-in
                cookie above and signs you out. The switch is ours, and it is
                the one that can.
              </p>

              <h3 className="text-xl font-semibold text-foreground mb-3">
                10.4 What Is Never Stored
              </h3>
              <p className="text-foreground mb-4">
                There is no session storage, no IndexedDB database and no
                service worker. There is no analytics or telemetry of any kind
                &mdash; not disabled, not configurable, simply absent, and no
                such dependency is in the build. The daily totals in section 2.2
                are counted by this server, and nothing in your browser takes
                part. The fonts this site is written in are served from this
                instance and fetched from nowhere else. The one exception is the
                lettering on the map itself: its labels are drawn from glyph
                ranges requested, as they are needed, from the same basemap
                provider that serves its tiles &mdash; so it is the party
                already described in section 4.4, and not a new one.
              </p>
              <p className="text-foreground mb-4">
                This software sets no third-party cookies of its own. One
                outside party acts on its own account rather than ours, and it
                is disclosed above rather than denied: the basemap provider your
                operator chose, whose servers answer the requests described in
                section 4.4 and may set cookies of their own.
              </p>
              {googleClientId && (
                <p className="text-foreground mb-4">
                  Google used to be the second, and deliberately is not any
                  more. Nothing of Google&rsquo;s runs in your browser on this
                  site, and Google sets nothing in your browser under this
                  address. Signing in with Google takes you to Google, where
                  whatever it stores is its own on its own address &mdash;
                  section 4.13 has the detail.
                </p>
              )}
              <p className="text-foreground mb-4">
                One exception belongs to operators rather than to divers. If
                this copy has the optional admin panel turned on, that panel
                sets its own session cookies under its own address. They are the
                tool of whoever administers this copy, they appear only for
                someone signing in to it, and they are documented for operators
                in the self-hosting documentation rather than here. That panel
                is a separate thing from the Admin section inside this app,
                which whoever runs this copy reaches from their own account
                menu: those are ordinary pages on this address, signed in to
                exactly like the rest of it, and they store nothing of their
                own.
              </p>
              <p className="text-foreground mb-4">
                The rule this project holds itself to, stricter than the law
                requires: the day any analytics, A/B testing or advertising
                storage is added to OpenDiving, a real consent flow ships with
                it and this section changes in the same breath. And any new key
                added to browser storage owes this section a line in the same
                change &mdash; a rule with a test behind it rather than only
                good intentions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Changes to This Privacy Policy
              </h2>
              <p className="text-foreground mb-4">
                This page is part of the software, so it changes when the
                software changes and ships in the same release. There is no
                separate mechanism that emails everyone about a policy change,
                and this page is not going to promise one it does not have.
              </p>
              <p className="text-foreground mb-4">
                What exists instead is better in one respect: the page is in the
                public source repository, so its full history &mdash; every
                edit, when it was made, and what it replaced &mdash; is readable
                by anyone, and no version of it can be quietly withdrawn. Which
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
                  Anyone who finds this page saying something the code does not
                  do can report it, and that is treated as a defect rather than
                  as wording
                </li>
                <li>
                  If you would rather trust nobody at all, you can run your own
                  copy, and then every question on this page has the same
                  answer: you
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                13. Contact
              </h2>
              <p className="text-foreground mb-4">
                Most of what people write to a privacy address to ask for, you
                can simply do.{" "}
                {commonsPrimary
                  ? "Exporting what you have entered, your photo proposals and your proposals for OpenDiving Commons aside, and deleting your account are buttons in Settings,"
                  : "Exporting what you have entered, your photo proposals aside, and deleting your account are buttons in Settings,"}{" "}
                and bringing a logbook back in is one on the Import page; they
                work immediately, they need nobody&rsquo;s approval, and no
                request has to be sent to anyone.
              </p>
              <p className="text-foreground mb-4">
                For anything else &mdash; a question about this page, about how
                this copy is run,{" "}
                {commonsPrimary && "a report about a Commons record, "}or about
                a right in section 6.2 that those buttons do not cover &mdash;
                the person to ask is whoever runs this copy of OpenDiving. They
                are the controller of your data, whether that is the OpenDiving
                project running a copy of its own or somebody else entirely; an
                author who does not run this copy holds none of your data and
                could not answer for whoever does. The{" "}
                <Link
                  href="/support"
                  className="underline hover:text-muted-foreground"
                >
                  support page
                </Link>{" "}
                is how this copy offers to reach them.
              </p>
              {projectOperated && (
                <p className="text-foreground mb-4">
                  On this copy they are named rather than described:{" "}
                  <em>Who Runs This Copy</em> at the top of this page gives the
                  operator&rsquo;s name and an address that reaches them, so a
                  request need not go through the support page at all. That
                  address is the operator&rsquo;s, in the role that can act on
                  it &mdash; which leaves the next paragraph exactly as it
                  stands.
                </p>
              )}
              <p className="text-foreground mb-4">
                Two things this page will not do, both deliberately. It will not
                print an address belonging to the OpenDiving project as the
                software&rsquo;s author, because the address that can act on a
                privacy request is the operator&rsquo;s, and the support page
                above is already it &mdash; on a copy the project runs itself,
                that page reaches the project too, in the role that can answer.
                Sent to the author instead, the request reaches people with no
                access to this copy. And it will not point you at a public issue
                tracker, because a question about your own data is not something
                you should have to ask in public. How quickly you get an answer
                is the operator&rsquo;s to say, not this page&rsquo;s.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                This policy describes this copy of OpenDiving, and is part of
                the release it ships in.
              </p>
              <Link
                href="/"
                className="mt-4 sm:mt-0 text-sm font-medium text-foreground underline hover:text-muted-foreground"
              >
                Back to OpenDiving
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
