"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ThemeMenuItems, ThemeToggle } from "@/components/theme-toggle";
import { DiveIcon, Logo } from "@/components/logo";
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
  Luggage,
  Backpack,
  BadgeCheck,
  ClipboardList,
  GraduationCap,
  BookUser,
  Users,
  Fish,
  CloudUpload,
  CloudDownload,
  Shield,
  ChevronDown,
  House,
  Sparkles,
  Server,
  CodeXml,
} from "lucide-react";
import { DiveSiteIcon } from "@/components/icons/dive-site-icon";
import { useEffect, useState } from "react";
import {
  useQuickCreate,
  type QuickCreateKind,
} from "@/components/layout/quick-create";
import { NotificationsMenu } from "@/components/layout/notifications-menu";

// Everything the "+" menu can start. It's the one way to create from the chrome
// at every width - the mobile menu deliberately doesn't repeat these, so the
// hamburger is navigation and "+" is creation. A dive is the only form big
// enough to warrant its own page; the rest open a dialog over whatever the diver
// is looking at. Import follows them, ruled off, as the last entry; the account
// menu carries it too, beside Export.
// `icon` is typed by what this menu actually renders - a component taking a
// `className` - rather than as `LucideIcon`: "New dive" carries the brand mark,
// which is a plain function component and not one of lucide's forward-ref
// exports.
type CreateAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} & ({ href: string } | { kind: QuickCreateKind });

const CREATE_ACTIONS: CreateAction[] = [
  { label: "New dive", icon: DiveIcon, href: "/dives/new" },
  { label: "New trip", icon: Luggage, kind: "trip" },
  { label: "New dive site", icon: DiveSiteIcon, kind: "site" },
  { label: "New gear", icon: Backpack, kind: "gear" },
  { label: "New certification", icon: BadgeCheck, kind: "certification" },
  { label: "New course", icon: GraduationCap, kind: "course" },
];

// Every signed-in destination, in the order all three consumers list them: the
// bar takes `primary` and `lg`, More takes `lg` and `more`, the burger takes
// all. `lg` items sit in the bar from `lg` and in More below it. `href` doubles
// as the path prefix that marks the item active. A `superuser` item is listed
// only for the account with the rights - a courtesy to a diver who would only
// meet a 403, since the API gates the routes themselves. The burger rules a
// `ruled` item off from the one above it. See "The header sorts its
// destinations by use" in DECISIONS.md.
type NavTier = "primary" | "lg" | "more";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tier: NavTier;
  superuser?: true;
  ruled?: true;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home", icon: House, tier: "primary" },
  {
    label: "Trips",
    href: "/trips",
    icon: Luggage,
    tier: "primary",
    ruled: true,
  },
  { label: "Dives", href: "/dives", icon: DiveIcon, tier: "primary" },
  { label: "Dive Sites", href: "/sites", icon: DiveSiteIcon, tier: "primary" },
  { label: "Marine Life", href: "/species", icon: Fish, tier: "primary" },
  { label: "Gear", href: "/gear", icon: Backpack, tier: "lg", ruled: true },
  {
    label: "Certifications",
    href: "/certifications",
    icon: BadgeCheck,
    tier: "lg",
  },
  { label: "Courses", href: "/courses", icon: GraduationCap, tier: "more" },
  { label: "People", href: "/people", icon: Users, tier: "more" },
  { label: "Contacts", href: "/contacts", icon: BookUser, tier: "more" },
  // A plain `Link` like the rest, so nothing under `app/admin/` is imported
  // here and the App Router keeps that chunk out of every other bundle.
  {
    label: "Admin",
    href: "/admin",
    icon: Shield,
    tier: "more",
    superuser: true,
    ruled: true,
  },
];

function getCurrentItem(pathname: string | null): NavItem | undefined {
  if (!pathname) return undefined;
  return NAV_ITEMS.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

// More turns coral when the current page is one of its rows at this width.
// `lg:hover:` restores the hover the `lg:` reset would otherwise outrank.
const MORE_ACTIVE: Record<NavTier, string> = {
  primary: "text-foreground",
  lg: "text-coral lg:text-foreground lg:hover:text-coral",
  more: "text-coral",
};

export function Header() {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();
  const openCreate = useQuickCreate();
  const pathname = usePathname();
  const currentItem = getCurrentItem(pathname);
  const navItems = NAV_ITEMS.filter(
    (item) => !item.superuser || user?.is_superuser,
  );
  const barItems = navItems.filter((item) => item.tier !== "more");
  const moreItems = navItems.filter((item) => item.tier !== "primary");
  // The create menu is reachable from every page, so the form it opens is told
  // where it was launched from - otherwise its Back/Cancel would guess.
  const withReturnTo = useWithReturnTo();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Escape closes the mobile menu, and a tap outside it lands on its backdrop. A
  // press in one of the header's own popups - its menus and the bell, portalled
  // above the backdrop - closes it too: a choice made there is done with the
  // menu, and one that navigates would otherwise leave it open over the page.
  // While it is open the page behind is locked, so only the menu scrolls; a
  // window widened past `md` drops the menu, and the lock with it.
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 48rem)");
    const handleDesktop = () => {
      if (desktop.matches) setIsMobileMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest?.("[data-radix-popper-content-wrapper]")) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    desktop.addEventListener("change", handleDesktop);
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      desktop.removeEventListener("change", handleDesktop);
    };
  }, [isMobileMenuOpen]);

  // `print:hidden` because `/checkin` prints, and the summary it prints is the page
  // alone - a nav bar on a sheet handed across a dive-shop desk is noise.
  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm border-b print:hidden">
      {/* Dims the page below the header while the mobile menu is open, leaving
          the header and its burger live: a tap on the dimmed page closes the
          menu and lands on nothing, rather than on whatever it was covering. It
          closes on the click, so it is still there to take it. The header's
          menus and bell portal above it, and a popover waiting for that click to
          close sees it too. Mounted throughout so it can fade both ways; shut,
          it lets taps through at once rather than after the fade. */}
      <div
        aria-hidden
        data-mobile-menu-backdrop
        className={`fixed inset-x-0 bottom-0 top-(--header-height) bg-black/60 transition-[opacity,visibility] duration-300 motion-reduce:transition-none md:hidden ${
          isMobileMenuOpen
            ? "visible opacity-100"
            : "pointer-events-none invisible opacity-0"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 touch:py-3">
          {/* Logo and Navigation. The gap is the nav's, so it goes with the nav
              below `md` - at 320px that room is what the four controls need.
              Both gaps stay narrow until `lg`: at 768px the bar's six items fit
              only that way. */}
          <div className="flex items-center md:space-x-4 lg:space-x-8">
            <Link
              href={isAuthenticated ? "/home" : "/"}
              className="flex flex-shrink-0 items-center space-x-2 touch:min-h-11"
            >
              <Logo className="h-7 w-7 sm:h-8 sm:w-8 text-coral flex-shrink-0" />
              {/* A `<span>`, not an `<h1>`. The wordmark is site furniture that
                  appears on every page; as a heading it gave every page two
                  `<h1>`s, and made "OpenDiving" - rather than the page's own
                  title - the first thing a screen reader's heading list offers.
                  Lifted a sixteenth of an em: centred by its box, Outfit's
                  lowercase sits 1.5px under the nav's Inter beside it. */}
              <span className="relative -top-[0.0625em] font-wordmark text-lg sm:text-2xl font-bold tracking-wordmark text-foreground whitespace-nowrap">
                OpenDiving
              </span>
            </Link>

            {/* Desktop Navigation - Show different nav based on auth status */}
            <nav className="hidden md:flex flex-shrink-0 items-center space-x-4 lg:space-x-6">
              {isAuthenticated ? (
                <>
                  {barItems.map((item) => {
                    const isCurrent = item === currentItem;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`whitespace-nowrap touch:py-3 text-sm font-medium transition-colors hover:text-coral ${
                          item.tier === "lg" ? "hidden lg:inline-flex" : ""
                        } ${isCurrent ? "text-coral" : "text-foreground"}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={`group inline-flex items-center whitespace-nowrap touch:py-3 text-sm font-medium transition-colors hover:text-coral ${
                        currentItem
                          ? MORE_ACTIVE[currentItem.tier]
                          : "text-foreground"
                      }`}
                    >
                      More
                      <ChevronDown className="ml-1 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {moreItems.map((item) => {
                        const Icon = item.icon;
                        // `lg:hidden` leaves a `display:none` row that
                        // Radix's focusFirst loop skips: `.focus()` on it does
                        // not move `document.activeElement`.
                        return (
                          <DropdownMenuItem
                            key={item.href}
                            asChild
                            className={
                              item.tier === "lg" ? "lg:hidden" : undefined
                            }
                          >
                            <Link
                              href={item.href}
                              aria-current={
                                item === currentItem ? "page" : undefined
                              }
                              className="flex items-center"
                            >
                              <Icon className="mr-2 h-4 w-4" />
                              {item.label}
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Link
                    href="/#features"
                    className="whitespace-nowrap touch:py-3 text-sm font-medium text-foreground hover:text-primary"
                  >
                    Features
                  </Link>
                  <Link
                    href="/#self-hosting"
                    className="whitespace-nowrap touch:py-3 text-sm font-medium text-foreground hover:text-primary"
                  >
                    Self-hosting
                  </Link>
                  <a
                    href="https://github.com/opendiving/opendiving-web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap touch:py-3 text-sm font-medium text-foreground hover:text-primary"
                  >
                    Source
                  </a>
                </>
              )}
            </nav>
          </div>

          {/* Actions */}
          {/* Phones narrower than 370px get tighter gaps, so the wordmark and
              the four controls don't crowd each other. On touch, under 360px,
              the controls narrow to 40 and sit flush: four 44px boxes and the
              wordmark are wider than a 320px screen. */}
          <div className="flex flex-shrink-0 items-center space-x-2 max-[370px]:space-x-1 max-[360px]:touch:space-x-0">
            {isAuthenticated && user && (
              <DropdownMenu>
                {/* The hint wraps the *menu* trigger rather than sitting
                    inside it: two nested `asChild` slots both reach the same
                    button, and this order is the one Radix documents. */}
                <IconTooltip label="Create new">
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 max-[370px]:px-2 max-[360px]:touch:min-w-10"
                    >
                      <Plus className="h-4 w-4 touch:h-5 touch:w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                </IconTooltip>
                <DropdownMenuContent align="end">
                  {CREATE_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return "href" in action ? (
                      <DropdownMenuItem key={action.label} asChild>
                        <Link
                          href={withReturnTo(action.href)}
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      href={withReturnTo("/import")}
                      className="flex items-center"
                    >
                      <CloudUpload className="mr-2 h-4 w-4" />
                      Import dives
                    </Link>
                  </DropdownMenuItem>
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
                <NotificationsMenu />
                {/* User dropdown */}
                <DropdownMenu>
                  <IconTooltip label="Account menu">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="relative me-3 h-9 w-9 rounded-full p-0 max-[370px]:me-2 md:me-0 max-[360px]:touch:me-0 max-[360px]:touch:min-w-10"
                      >
                        <UserAvatar
                          name={user.name}
                          avatarSha={user.avatar_sha256}
                          size={36}
                          className="h-9 w-9"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                  </IconTooltip>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-sm font-medium">
                      {user.name}
                    </div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      @{user.username}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/checkin" className="flex items-center">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Check-in
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href={withReturnTo("/import")}
                        className="flex items-center"
                      >
                        <CloudUpload className="mr-2 h-4 w-4" />
                        Import
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/data" className="flex items-center">
                        <CloudDownload className="mr-2 h-4 w-4" />
                        Export
                      </Link>
                    </DropdownMenuItem>
                    {/* Straight to the first section: `/settings` only redirects
                        there, and is kept for the links in the API's emails. */}
                    <DropdownMenuItem asChild>
                      <Link
                        href="/settings/account"
                        className="flex items-center"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ThemeMenuItems />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
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
                <Link href="/signin">Sign in</Link>
              </Button>
            )}

            {/* Mobile menu button */}
            <IconTooltip label={isMobileMenuOpen ? "Close menu" : "Open menu"}>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden px-3 max-[370px]:px-2 max-[360px]:touch:min-w-10"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <Menu className="h-4 w-4 touch:h-5 touch:w-5" />
              </Button>
            </IconTooltip>
          </div>
        </div>

        {/* Mobile Navigation: two thirds of the width, sliding in from the
            right under the header. Mounted throughout so it can slide out as
            well as in; `invisible` takes it out of the tab order and the
            accessibility tree while it is shut. The list is taller than a short
            phone, so it scrolls on its own. */}
        <div
          id="mobile-menu"
          className={`fixed bottom-0 right-0 top-(--header-height) w-2/3 overflow-y-auto overscroll-contain border-l bg-background py-2 shadow-lg transition-[translate,visibility] duration-300 motion-reduce:transition-none md:hidden ${
            isMobileMenuOpen
              ? "visible translate-x-0"
              : "pointer-events-none invisible translate-x-full"
          }`}
        >
          <nav className="flex flex-col">
            {isAuthenticated ? (
              <>
                {navItems.map((item) => {
                  const isCurrent = item === currentItem;
                  const Icon = item.icon;
                  return (
                    <React.Fragment key={item.href}>
                      {item.ruled && <hr className="mx-4 my-2" />}
                      <Link
                        href={item.href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center gap-3 px-4 py-3 text-lg font-medium transition-colors hover:bg-accent focus-visible:bg-accent ${
                          isCurrent ? "text-coral" : "text-foreground"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              <>
                <Link
                  href="/#features"
                  className="flex items-center gap-3 px-4 py-3 text-lg font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Sparkles className="h-5 w-5 shrink-0" />
                  Features
                </Link>
                <Link
                  href="/#self-hosting"
                  className="flex items-center gap-3 px-4 py-3 text-lg font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Server className="h-5 w-5 shrink-0" />
                  Self-hosting
                </Link>
                <a
                  href="https://github.com/opendiving/opendiving-web"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 text-lg font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <CodeXml className="h-5 w-5 shrink-0" />
                  Source
                </a>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
