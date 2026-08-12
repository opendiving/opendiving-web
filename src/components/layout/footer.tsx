import { Logo } from "@/components/logo";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-muted text-foreground py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Logo className="h-6 w-6 text-coral" />
              <span className="text-lg font-semibold">OpenDiving</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Open source diving platform for the global diving community.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
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
          </div>
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
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
          </div>
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
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
          </div>
        </div>
        <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 OpenDiving. Open source diving platform.</p>
        </div>
      </div>
    </footer>
  );
}
