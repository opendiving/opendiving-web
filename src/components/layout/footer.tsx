import { Logo } from "@/components/logo";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Logo className="h-6 w-6 text-coral" />
              <span className="text-lg font-semibold">OpenDiving</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">
              Open source diving platform for the global diving community.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Dive Log
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Community
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Dive Sites
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Equipment
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  API
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Contributing
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Help Center
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Safety Guidelines
                </a>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="hover:text-neutral-900 dark:hover:text-white"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-neutral-200 dark:border-neutral-800 mt-12 pt-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
          <p>&copy; 2026 OpenDiving. Open source diving platform.</p>
        </div>
      </div>
    </footer>
  );
}
