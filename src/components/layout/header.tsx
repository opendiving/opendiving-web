"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User,
  LogOut,
  Settings,
  BookOpen,
  Menu,
  Plus,
  Waves,
  MapPin,
  Luggage,
  Backpack,
} from "lucide-react";
import { useState } from "react";

// Maps URL path prefixes to the nav item that should be highlighted as active.
const NAV_SECTIONS: { prefix: string; page: string }[] = [
  { prefix: "/dashboard", page: "dashboard" },
  { prefix: "/trips", page: "trips" },
  { prefix: "/dives", page: "dives" },
  { prefix: "/sites", page: "sites" },
  { prefix: "/gear", page: "gear" },
  { prefix: "/community", page: "community" },
];

function getCurrentPage(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  return NAV_SECTIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.page;
}

export function Header() {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();
  const pathname = usePathname();
  const currentPage = getCurrentPage(pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link
              href="/"
              className="flex flex-shrink-0 items-center space-x-2"
            >
              <Logo className="h-7 w-7 sm:h-8 sm:w-8 text-coral flex-shrink-0" />
              <h1 className="text-lg sm:text-2xl font-bold text-foreground whitespace-nowrap">
                OpenDiving
              </h1>
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
                      currentPage === "trips"
                        ? "text-coral"
                        : "text-foreground"
                    }`}
                  >
                    Trips
                  </Link>
                  <Link
                    href="/dives"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "dives"
                        ? "text-coral"
                        : "text-foreground"
                    }`}
                  >
                    Dives
                  </Link>
                  <Link
                    href="/sites"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "sites"
                        ? "text-coral"
                        : "text-foreground"
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
                  <Link
                    href="/community"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-coral ${
                      currentPage === "community"
                        ? "text-coral"
                        : "text-foreground"
                    }`}
                  >
                    Community
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
                    href="/#community"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
                  >
                    Community
                  </Link>
                  <Link
                    href="/#about"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
                  >
                    About
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Actions */}
          <div className="flex flex-shrink-0 items-center space-x-3">
            {isAuthenticated && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden sm:inline-flex"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/dives/new" className="flex items-center">
                      <Waves className="mr-2 h-4 w-4" />
                      New Dive
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/trips/new" className="flex items-center">
                      <Luggage className="mr-2 h-4 w-4" />
                      New Trip
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/sites/new" className="flex items-center">
                      <MapPin className="mr-2 h-4 w-4" />
                      New Dive Site
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/gear" className="flex items-center">
                      <Backpack className="mr-2 h-4 w-4" />
                      Manage Gear
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ThemeToggle />
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
                    >
                      <UserAvatar
                        email={user.email}
                        name={user.name}
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
                      <Link href="/profile" className="flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden px-2 sm:px-3"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t py-4">
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
                  <Link
                    href="/community"
                    className={`text-sm font-medium hover:text-coral py-2 ${currentPage === "community" ? "text-coral" : "text-foreground"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Community
                  </Link>
                  <div className="pt-3 border-t space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Create New
                    </p>
                    <Link
                      href="/dives/new"
                      className="flex items-center text-sm font-medium text-foreground hover:text-coral py-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Waves className="mr-2 h-4 w-4" />
                      New Dive
                    </Link>
                    <Link
                      href="/trips/new"
                      className="flex items-center text-sm font-medium text-foreground hover:text-coral py-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Luggage className="mr-2 h-4 w-4" />
                      New Trip
                    </Link>
                    <Link
                      href="/sites/new"
                      className="flex items-center text-sm font-medium text-foreground hover:text-coral py-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      New Dive Site
                    </Link>
                    <Link
                      href="/gear"
                      className="flex items-center text-sm font-medium text-foreground hover:text-coral py-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Backpack className="mr-2 h-4 w-4" />
                      Manage Gear
                    </Link>
                  </div>
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
                    href="/#community"
                    className="text-sm font-medium text-foreground hover:text-primary py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Community
                  </Link>
                  <Link
                    href="/#about"
                    className="text-sm font-medium text-foreground hover:text-primary py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    About
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
