"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { isFormPath } from "@/lib/return-to";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ThemeMenuItems, ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Settings,
  Menu,
  Plus,
  Waves,
  MapPin,
  Luggage,
  Backpack,
  BadgeCheck,
  GraduationCap,
  Fish,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useQuickCreate,
  type QuickCreateKind,
} from "@/components/layout/quick-create";

// Everything the "+" menu can start. It's the single way to create from the
// chrome at every width - the mobile menu deliberately doesn't repeat these, so
// the hamburger is navigation and "+" is creation. A dive is the only form big
// enough to warrant its own page; the rest open a dialog over whatever the
// diver is looking at.
type CreateAction = { label: string; icon: LucideIcon } & (
  { href: string } | { kind: QuickCreateKind }
);

const CREATE_ACTIONS: CreateAction[] = [
  { label: "New Dive", icon: Waves, href: "/dives/new" },
  { label: "New Trip", icon: Luggage, kind: "trip" },
  { label: "New Dive Site", icon: MapPin, kind: "site" },
  { label: "New Gear", icon: Backpack, kind: "gear" },
  { label: "New Certification", icon: BadgeCheck, kind: "certification" },
  { label: "New Course", icon: GraduationCap, kind: "course" },
];

// The create menu is reachable from every page, so the form it opens is told
// where it was launched from - otherwise its Back/Cancel would guess. Nothing is
// appended when the current page is itself a form (see `isFormPath`), which
// would otherwise send Cancel straight back to the form being cancelled.
function withReturnTo(href: string, pathname: string | null): string {
  if (!pathname || isFormPath(pathname)) return href;
  return `${href}?from=${encodeURIComponent(pathname)}`;
}

// Maps URL path prefixes to the nav item that should be highlighted as active.
const NAV_SECTIONS: { prefix: string; page: string }[] = [
  { prefix: "/dashboard", page: "dashboard" },
  { prefix: "/trips", page: "trips" },
  { prefix: "/dives", page: "dives" },
  { prefix: "/sites", page: "sites" },
  { prefix: "/gear", page: "gear" },
  { prefix: "/certifications", page: "certifications" },
  { prefix: "/courses", page: "courses" },
  { prefix: "/species", page: "species" },
];

function getCurrentPage(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  return NAV_SECTIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.page;
}

export function Header() {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();
  const openCreate = useQuickCreate();
  const pathname = usePathname();
  const currentPage = getCurrentPage(pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const { toast } = useToast();

  // `signOut` rejects when the server never confirmed, and deliberately leaves
  // the diver signed in when it does - so this is the one place that can say so.
  // Silently swallowing it would leave them looking at an unchanged page with no
  // idea their session is still open.
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast({
        title: "Couldn't sign you out",
        description: getApiErrorMessage(
          error,
          "You're still signed in. Check your connection and try again.",
        ),
        variant: "destructive",
      });
    }
  };

  // The mobile menu lives inside the sticky header, so it has no overlay of its
  // own to dismiss it - without this, tapping the page or hitting Escape leaves
  // it covering the screen and only the toggle can close it again.
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (headerRef.current?.contains(event.target as Node)) return;
      setIsMobileMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-background shadow-sm border-b"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link
              href="/"
              className="flex flex-shrink-0 items-center space-x-2"
            >
              <Logo className="h-7 w-7 sm:h-8 sm:w-8 text-coral flex-shrink-0" />
              {/* A `<span>`, not an `<h1>`. The wordmark is site furniture that
                  appears on every page; as a heading it gave every page two
                  `<h1>`s, and made "OpenDiving" - rather than the page's own
                  title - the first thing a screen reader's heading list offers.
                  Styling is unchanged. */}
              <span className="text-lg sm:text-2xl font-bold text-foreground whitespace-nowrap">
                OpenDiving
              </span>
            </Link>

            {/* Desktop Navigation - Show different nav based on auth status */}
            <nav className="hidden md:flex flex-shrink-0 items-center space-x-6">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "dashboard"
                        ? "text-coral"
                        : "text-foreground"
                    }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/trips"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "trips" ? "text-coral" : "text-foreground"
                    }`}
                  >
                    Trips
                  </Link>
                  <Link
                    href="/dives"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "dives" ? "text-coral" : "text-foreground"
                    }`}
                  >
                    Dives
                  </Link>
                  <Link
                    href="/sites"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "sites" ? "text-coral" : "text-foreground"
                    }`}
                  >
                    Dive Sites
                  </Link>
                  <Link
                    href="/gear"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "gear" ? "text-coral" : "text-foreground"
                    }`}
                  >
                    Gear
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/#features"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
                  >
                    Features
                  </Link>
                  <Link
                    href="/#self-hosting"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
                  >
                    Self-hosting
                  </Link>
                  <a
                    href="https://github.com/opendiving/opendiving-web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
                  >
                    Source
                  </a>
                </>
              )}
            </nav>
          </div>

          {/* Actions */}
          {/* Tighter gaps on the narrowest phones, where the wordmark and the
              three controls would otherwise be squeezed against each other. */}
          <div className="flex flex-shrink-0 items-center space-x-1 sm:space-x-3">
            {isAuthenticated && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Create new">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {CREATE_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return "href" in action ? (
                      <DropdownMenuItem key={action.label} asChild>
                        <Link
                          href={withReturnTo(action.href, pathname)}
                          className="flex items-center"
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {action.label}
                        </Link>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        key={action.label}
                        onSelect={() => openCreate(action.kind)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {action.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Signed in, the theme choices live in the user menu with the
                other account preferences; signed out there's no such menu, so
                the standalone control stands in. */}
            {!isLoading && !isAuthenticated && <ThemeToggle />}
            {isLoading ? (
              <div className="animate-pulse bg-muted rounded-md h-9 w-20"></div>
            ) : isAuthenticated && user ? (
              <>
                {/* User dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-9 w-9 rounded-full p-0"
                      aria-label="Account menu"
                    >
                      <UserAvatar
                        name={user.name}
                        avatarSha={user.avatar_sha256}
                        size={36}
                        className="h-9 w-9"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-sm font-medium">
                      {user.name}
                    </div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      @{user.username}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href="/certifications"
                        className="flex items-center"
                      >
                        <BadgeCheck className="mr-2 h-4 w-4" />
                        Certifications
                      </Link>
                    </DropdownMenuItem>
                    {/* Beside Certifications rather than in the main nav: both
                        are training records, and the main nav's five slots are
                        for the destinations a diver goes to on every visit. */}
                    <DropdownMenuItem asChild>
                      <Link href="/courses" className="flex items-center">
                        <GraduationCap className="mr-2 h-4 w-4" />
                        Courses
                      </Link>
                    </DropdownMenuItem>
                    {/* Here for the same reason, by a different argument: the
                        life list is a look-at-my-collection page rather than a
                        working destination, so it does not earn one of those
                        five slots either. */}
                    <DropdownMenuItem asChild>
                      <Link href="/species" className="flex items-center">
                        <Fish className="mr-2 h-4 w-4" />
                        Species
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ThemeMenuItems />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-coral text-primary-foreground hover:bg-coral/90"
              >
                <Link href="/signin">Sign In</Link>
              </Button>
            )}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden px-2 sm:px-3"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          // Capped and scrollable: the full list is taller than a short phone
          // viewport, and because the header is sticky the overflow can only be
          // reached by scrolling the page behind it - impossible on a page with
          // nothing to scroll.
          <div
            id="mobile-menu"
            className="md:hidden border-t py-4 max-h-[calc(100dvh-4.5rem)] overflow-y-auto"
          >
            <nav className="flex flex-col space-y-3">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "dashboard" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/trips"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "trips" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Trips
                  </Link>
                  <Link
                    href="/dives"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "dives" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dives
                  </Link>
                  <Link
                    href="/sites"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "sites" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dive Sites
                  </Link>
                  <Link
                    href="/gear"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "gear" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Gear
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/#features"
                    className="text-sm font-medium text-foreground hover:text-primary py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Features
                  </Link>
                  <Link
                    href="/#self-hosting"
                    className="text-sm font-medium text-foreground hover:text-primary py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Self-hosting
                  </Link>
                  <a
                    href="https://github.com/opendiving/opendiving-web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-foreground hover:text-primary py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Source
                  </a>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
