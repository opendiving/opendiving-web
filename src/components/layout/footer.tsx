import { Logo } from "@/components/logo";
import Link from "next/link";

// The three column labels are deliberately not headings. This footer renders below
// every page, and a heading here has to fit whatever tree the page above it happens to
// have - the old `<h4>` followed pages whose last heading was an `<h2>`, which is the
// jump axe reports as `heading-order`. They are group labels rather than sections of the
// document, so each column is a named `nav` landmark instead: reachable by landmark
// navigation, and out of the heading outline where no fixed level can be correct.
export function Footer() {
  // `print:hidden` for the same reason as the header's: `/checkin` prints the
  // summary alone, and no page wants the chrome on paper.
  return (
    <footer className="bg-muted text-foreground py-12 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Three tiers, not two. Below `sm:` everything stacks; from `md:` up the brand
            block is the first of four equal columns. Between the two - the tablet widths
            this footer used to spend four stacked rows on - the three link columns share
            a row and the brand block spans it: the links would fit four-up at 640px, but
            the sentence under the wordmark drops to four lines in a quarter of that width.
            `md:col-span-1` is the reset - without it the span carries on up. */}
        <div className="grid sm:grid-cols-3 md:grid-cols-4 gap-8">
          <div className="sm:col-span-3 md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <Logo className="h-6 w-6 text-coral" />
              <span className="text-lg font-semibold">OpenDiving</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Open source diving platform for the global diving community.
            </p>
          </div>
          <nav aria-labelledby="footer-platform">
            <p id="footer-platform" className="font-semibold mb-4">
              Platform
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/dives" className="hover:text-foreground">
                  Dive Log
                </Link>
              </li>
              <li>
                <Link href="/trips" className="hover:text-foreground">
                  Trips
                </Link>
              </li>
              <li>
                <Link href="/sites" className="hover:text-foreground">
                  Dive Sites
                </Link>
              </li>
              <li>
                <Link href="/gear" className="hover:text-foreground">
                  Equipment
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-resources">
            <p id="footer-resources" className="font-semibold mb-4">
              Resources
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://github.com/opendiving"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/opendiving/opendiving-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  API
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/opendiving/opendiving-web/blob/main/CONTRIBUTING.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  Contributing
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/opendiving/opendiving-web/blob/main/CODE_OF_CONDUCT.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  Code of Conduct
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-support">
            <p id="footer-support" className="font-semibold mb-4">
              Support
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 OpenDiving. Open source diving platform.</p>
        </div>
      </div>
    </footer>
  );
}
