import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read OpenDiving's Terms of Service to understand your rights and responsibilities when using our open-source diving platform.",
};

export default function TermsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-card rounded-lg shadow-sm p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Terms of Service
          </h1>
          <p className="text-muted-foreground">Last updated: September 2025</p>
        </div>

        <div className="prose max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground mb-4">
              By accessing and using OpenDiving ("the Service"), you accept and
              agree to be bound by the terms and provision of this agreement. If
              you do not agree to abide by the above, please do not use this
              service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. Description of Service
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is an open-source diving platform that allows users to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Log and track diving activities</li>
              <li>Connect with other divers in the community</li>
              <li>Share diving experiences and photos</li>
              <li>Discover dive sites and plan diving trips</li>
              <li>Manage diving equipment and certifications</li>
            </ul>
            <p className="text-foreground mb-4">
              The Service is provided free of charge and is supported by the
              open-source community.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. User Accounts and Registration
            </h2>
            <p className="text-foreground mb-4">
              To use certain features of the Service, you must register for an
              account. You agree to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Provide accurate, current, and complete information during
                registration
              </li>
              <li>Maintain the security of your password and account</li>
              <li>
                Notify us immediately of any unauthorized use of your account
              </li>
              <li>
                Accept responsibility for all activities under your account
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              4. Safety and Diving Responsibilities
            </h2>
            <div className="rounded-md border border-warning/40 bg-warning/10 p-4 mb-4">
              <p className="font-medium text-warning">
                <strong>Important Safety Notice:</strong> OpenDiving is a
                platform for logging and sharing diving experiences. It does not
                provide diving instruction, safety advice, or emergency
                services.
              </p>
            </div>
            <p className="text-foreground mb-4">
              You acknowledge and agree that:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Diving is an inherently risky activity</li>
              <li>
                You are solely responsible for your diving safety and decisions
              </li>
              <li>
                You will only dive within your certification and experience
                level
              </li>
              <li>
                You will follow proper diving safety protocols and procedures
              </li>
              <li>
                OpenDiving is not liable for any diving-related injuries or
                incidents
              </li>
              <li>
                Information shared by other users should not be considered
                professional advice
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              5. User Content and Conduct
            </h2>
            <p className="text-foreground mb-4">
              You are responsible for all content you post to the Service. You
              agree not to post content that:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Is illegal, harmful, or violates any law or regulation</li>
              <li>Infringes on intellectual property rights of others</li>
              <li>
                Contains false or misleading information about dive sites or
                conditions
              </li>
              <li>Is offensive, discriminatory, or harassing</li>
              <li>Promotes dangerous diving practices</li>
              <li>Contains spam or unauthorized commercial content</li>
            </ul>
            <p className="text-foreground mb-4">
              By posting content, you grant OpenDiving a non-exclusive,
              worldwide, royalty-free license to use, modify, and display your
              content in connection with the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              6. Privacy and Data Protection
            </h2>
            <p className="text-foreground mb-4">
              Your privacy is important to us. Please review our{" "}
              <Link
                href="/privacy"
                className="underline hover:text-muted-foreground"
              >
                Privacy Policy
              </Link>
              , which explains how we collect, use, and protect your
              information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              7. Open Source License
            </h2>
            <p className="text-foreground mb-4">
              OpenDiving is open-source software. The source code is available
              under the GNU Affero General Public License v3 (AGPLv3). You are
              free to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Use, copy, modify, and distribute the software</li>
              <li>Contribute to the project development</li>
              <li>Create derivative works</li>
            </ul>
            <p className="text-foreground mb-4">
              Subject to the terms and conditions of the AGPLv3 License
              available in our GitHub repository.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              8. Service Availability and Modifications
            </h2>
            <p className="text-foreground mb-4">
              We strive to maintain service availability but cannot guarantee
              uninterrupted access. We reserve the right to:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>Modify or discontinue features of the Service</li>
              <li>
                Perform maintenance that may temporarily affect availability
              </li>
              <li>Update these Terms of Service with reasonable notice</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              9. Limitation of Liability
            </h2>
            <p className="text-foreground mb-4">
              To the maximum extent permitted by law, OpenDiving and its
              contributors shall not be liable for:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>
                Any indirect, incidental, special, or consequential damages
              </li>
              <li>Loss of data, profits, or business interruption</li>
              <li>Diving accidents or injuries of any kind</li>
              <li>Actions taken based on information found on the Service</li>
              <li>User-generated content or interactions with other users</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              10. Indemnification
            </h2>
            <p className="text-foreground mb-4">
              You agree to indemnify and hold harmless OpenDiving, its
              contributors, and affiliates from any claims, damages, or expenses
              arising from your use of the Service or violation of these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              11. Termination
            </h2>
            <p className="text-foreground mb-4">
              We may terminate or suspend your account at any time for
              violations of these Terms. You may delete your account at any time
              through your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              12. Governing Law
            </h2>
            <p className="text-foreground mb-4">
              These Terms shall be governed by and construed in accordance with
              the laws of the jurisdiction where the Service is primarily
              operated, without regard to conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              13. Contact Information
            </h2>
            <p className="text-foreground mb-4">
              If you have questions about these Terms of Service, please contact
              us through:
            </p>
            <ul className="list-disc list-inside text-foreground mb-4 space-y-2">
              <li>GitHub Issues in our repository</li>
              <li>Community discussion forums</li>
              <li>Email: legal@opendiving.app</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              These terms are effective as of September 2025 and apply to all
              users of OpenDiving.
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
