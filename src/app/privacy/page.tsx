import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how OpenDiving protects your privacy and handles your personal data on our open-source diving platform.",
};

export default function PrivacyPage() {
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
              OpenDiving ("we," "our," or "us") is committed to protecting your
              privacy. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our diving
              platform and services ("Service").
            </p>
            <p className="text-foreground mb-4">
              As an open-source project, we believe in transparency and user
              control over personal data. This policy outlines our practices and
              your rights regarding your personal information.
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
              When you create an account or use our Service, you may provide:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Account Information:</strong> Name, username, email
                address, password
              </li>
              <li>
                <strong>Profile Information:</strong> Diving certifications,
                experience level, bio, profile picture
              </li>
              <li>
                <strong>Dive Logs:</strong> Dive location, depth, duration,
                conditions, notes, photos
              </li>
              <li>
                <strong>Equipment Data:</strong> Diving equipment details and
                maintenance records
              </li>
              <li>
                <strong>Communication:</strong> Messages, comments, and posts in
                community features
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              2.2 Automatically Collected Information
            </h3>
            <p className="text-foreground mb-4">
              We may automatically collect certain information when you use our
              Service:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Usage Data:</strong> Pages visited, features used, time
                spent on the Service
              </li>
              <li>
                <strong>Device Information:</strong> Browser type, operating
                system, device identifiers
              </li>
              <li>
                <strong>IP Address:</strong> Your internet protocol address and
                general location
              </li>
              <li>
                <strong>Cookies:</strong> Authentication tokens and user
                preferences
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              2.3 Location Information
            </h3>
            <p className="text-foreground mb-4">
              We may collect location information when you:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Add dive sites to your logs</li>
              <li>Share your location in posts or comments</li>
              <li>Use location-based features (with your permission)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-foreground mb-4">We use your information to:</p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Provide Services:</strong> Enable dive logging,
                community features, and platform functionality
              </li>
              <li>
                <strong>Account Management:</strong> Create and maintain your
                account, authenticate access
              </li>
              <li>
                <strong>Personalization:</strong> Customize your experience and
                provide relevant content
              </li>
              <li>
                <strong>Community Features:</strong> Enable connections with
                other divers and content sharing
              </li>
              <li>
                <strong>Communication:</strong> Send important updates, respond
                to inquiries
              </li>
              <li>
                <strong>Safety:</strong> Monitor for dangerous diving practices
                or inappropriate content
              </li>
              <li>
                <strong>Improvement:</strong> Analyze usage patterns to improve
                our Service
              </li>
              <li>
                <strong>Legal Compliance:</strong> Comply with applicable laws
                and regulations
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              4. Information Sharing and Disclosure
            </h2>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.1 Public Information
            </h3>
            <p className="text-foreground mb-4">
              Certain information is public by default:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Your username and public profile information</li>
              <li>Dive logs you choose to share publicly</li>
              <li>Comments and posts in public forums</li>
              <li>Ratings and reviews of dive sites</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.2 With Other Users
            </h3>
            <p className="text-foreground mb-4">
              We may share your information with other users when:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>You choose to share dive logs or experiences</li>
              <li>You participate in community discussions</li>
              <li>You connect with dive buddies or groups</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.3 Service Providers
            </h3>
            <p className="text-foreground mb-4">
              We may share information with third-party service providers who
              help us:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Host and maintain our servers</li>
              <li>Provide email communication services</li>
              <li>Analyze usage data</li>
              <li>Provide customer support</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              4.4 Map Tiles
            </h3>
            <p className="text-foreground mb-4">
              Several places in the app show a map, and your browser loads its
              images directly from a third-party tile provider. That provider
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
              If you run your own copy of OpenDiving you can point it at your
              own tile server, and none of this leaves your machine.
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
              4.6 Legal Requirements
            </h3>
            <p className="text-foreground mb-4">
              We may disclose your information when required by law or to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Respond to legal requests or court orders</li>
              <li>Protect our rights, property, or safety</li>
              <li>Protect users from harm or illegal activities</li>
              <li>Prevent fraud or security threats</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              5. Data Security
            </h2>
            <p className="text-foreground mb-4">
              We implement appropriate security measures to protect your
              information:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Encryption:</strong> Data is encrypted in transit and at
                rest
              </li>
              <li>
                <strong>Access Control:</strong> Limited access to personal data
                on a need-to-know basis
              </li>
              <li>
                <strong>Authentication:</strong> Secure login with password
                requirements
              </li>
              <li>
                <strong>Monitoring:</strong> Regular security audits and
                vulnerability assessments
              </li>
              <li>
                <strong>Incident Response:</strong> Procedures for handling
                security breaches
              </li>
            </ul>
            <div className="rounded-md border bg-muted p-4 mb-4">
              <p className="text-muted-foreground">
                <strong>Note:</strong> As an open-source project, our security
                measures are transparent and can be reviewed in our public
                repository. We welcome security reports and contributions from
                the community.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              6. Your Privacy Rights and Choices
            </h2>

            <h3 className="text-xl font-semibold text-foreground mb-3">
              6.1 Account Control
            </h3>
            <p className="text-foreground mb-4">You can:</p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Update your profile and account information</li>
              <li>Control privacy settings for your dive logs</li>
              <li>Choose what information to share publicly</li>
              <li>Delete your account and associated data</li>
            </ul>

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

            <h3 className="text-xl font-semibold text-foreground mb-3">
              6.3 Communication Preferences
            </h3>
            <p className="text-foreground mb-4">You can control:</p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Email notifications and updates</li>
              <li>Community interaction notifications</li>
              <li>Safety and security alerts</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              7. Data Retention
            </h2>
            <p className="text-foreground mb-4">
              We retain your information for as long as:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Your account is active</li>
              <li>Needed to provide our services</li>
              <li>Required by law or for legitimate business purposes</li>
            </ul>
            <p className="text-foreground mb-4">
              When you delete your account:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Personal information is permanently deleted within 30 days
              </li>
              <li>Some anonymized data may be retained for analytics</li>
              <li>Legal or safety-related data may be retained as required</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              8. International Data Transfers
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving may store and process your information in various
              countries where our servers and service providers are located. We
              ensure appropriate safeguards are in place for international data
              transfers in compliance with applicable laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              9. Children's Privacy
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is not intended for children under 13. We do not
              knowingly collect personal information from children under 13. If
              we become aware that we have collected such information, we will
              delete it promptly.
            </p>
            <p className="text-foreground mb-4">
              Users between 13-18 should have parental consent before using our
              Service, especially given the nature of diving activities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              10. Cookies and Tracking Technologies
            </h2>
            <p className="text-foreground mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Essential Cookies:</strong> Enable basic functionality
                and security
              </li>
              <li>
                <strong>Preference Cookies:</strong> Remember your settings and
                preferences
              </li>
              <li>
                <strong>Analytics Cookies:</strong> Help us understand usage
                patterns
              </li>
            </ul>
            <p className="text-foreground mb-4">
              You can control cookie settings through your browser, though
              disabling essential cookies may affect Service functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-foreground mb-4">
              We may update this Privacy Policy from time to time. When we make
              significant changes, we will:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Post the updated policy on our website</li>
              <li>Update the "Last updated" date</li>
              <li>Notify users via email or Service notifications</li>
              <li>Provide a summary of key changes</li>
            </ul>
            <p className="text-foreground mb-4">
              Your continued use of the Service after changes take effect
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              12. Open Source Transparency
            </h2>
            <p className="text-foreground mb-4">
              As an open-source project, OpenDiving is committed to
              transparency:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Our code is publicly available for review</li>
              <li>Privacy practices can be verified through source code</li>
              <li>Community members can contribute to privacy improvements</li>
              <li>Data handling practices are documented in our repository</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              13. Contact Us
            </h2>
            <p className="text-foreground mb-4">
              If you have questions or concerns about this Privacy Policy or our
              data practices, please contact us:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                <strong>Email:</strong> privacy@opendiving.app
              </li>
              <li>
                <strong>GitHub Issues:</strong> Privacy-related issues in our
                repository
              </li>
              <li>
                <strong>Community Forum:</strong> Privacy discussions section
              </li>
              <li>
                <strong>Data Protection Officer:</strong> dpo@opendiving.app
              </li>
            </ul>
            <p className="text-foreground mb-4">
              We will respond to privacy inquiries within 30 days of receipt.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              This Privacy Policy is effective as of September 2025 and applies
              to all users of OpenDiving.
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
