"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Waves,
  User,
  LogOut,
  Settings,
  BookOpen,
  Menu,
  Bell,
  Search,
} from "lucide-react";
import { useState } from "react";

interface HeaderProps {
  showDashboardActions?: boolean;
  currentPage?: string;
}

export function Header({
  showDashboardActions = false,
  currentPage,
}: HeaderProps) {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <header className="bg-background shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link
              href="/"
              className="flex flex-shrink-0 items-center space-x-2"
            >
              <Waves className="h-8 w-8 text-blue-600 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-foreground whitespace-nowrap">
                OpenDiving
              </h1>
            </Link>

            {/* Desktop Navigation - Show different nav based on auth status */}
            <nav className="hidden md:flex flex-shrink-0 items-center space-x-6">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-blue-600 ${
                      currentPage === "dashboard"
                        ? "text-blue-600"
                        : "text-foreground"
                    }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/trips"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-blue-600 ${
                      currentPage === "trips"
                        ? "text-blue-600"
                        : "text-foreground"
                    }`}
                  >
                    Trips
                  </Link>
                  <Link
                    href="/dives"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-blue-600 ${
                      currentPage === "dives"
                        ? "text-blue-600"
                        : "text-foreground"
                    }`}
                  >
                    Dives
                  </Link>
                  <Link
                    href="/sites"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-blue-600 ${
                      currentPage === "sites"
                        ? "text-blue-600"
                        : "text-foreground"
                    }`}
                  >
                    Dive Sites
                  </Link>
                  <Link
                    href="/community"
                    className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-blue-600 ${
                      currentPage === "community"
                        ? "text-blue-600"
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
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-blue-600"
                  >
                    Features
                  </Link>
                  <Link
                    href="/#community"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-blue-600"
                  >
                    Community
                  </Link>
                  <Link
                    href="/#about"
                    className="whitespace-nowrap text-sm font-medium text-foreground hover:text-blue-600"
                  >
                    About
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Actions */}
          <div className="flex flex-shrink-0 items-center space-x-3">
            <ThemeToggle />
            {isLoading ? (
              <div className="animate-pulse bg-muted rounded-md h-9 w-20"></div>
            ) : isAuthenticated && user ? (
              <>
                {/* Search - Desktop - Only show when authenticated */}
                <Button variant="ghost" size="sm" className="hidden md:flex">
                  <Search className="h-4 w-4" />
                </Button>

                {/* Notifications - Only show when authenticated */}
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    3
                  </span>
                </Button>

                {/* Dashboard link for non-dashboard pages */}
                {!showDashboardActions && (
                  <Link href="/dashboard">
                    <Button variant="outline">Dashboard</Button>
                  </Link>
                )}

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
            ) : (
              <>
                {/* Unauthenticated state */}
                <Link href="/signin">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button>Sign Up</Button>
                </Link>
              </>
            )}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
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
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/trips"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Trips
                  </Link>
                  <Link
                    href="/dives"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dives
                  </Link>
                  <Link
                    href="/sites"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Dive Sites
                  </Link>
                  <Link
                    href="/community"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Community
                  </Link>
                  <div className="pt-3 border-t">
                    <Button variant="outline" size="sm" className="w-full mb-2">
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Link
                    href="/#features"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Features
                  </Link>
                  <Link
                    href="/#community"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Community
                  </Link>
                  <Link
                    href="/#about"
                    className="text-sm font-medium text-foreground hover:text-blue-600 py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    About
                  </Link>
                  <div className="pt-3 border-t">
                    <Link href="/signin">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mb-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/signup">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign Up
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
