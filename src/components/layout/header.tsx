"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Waves, Users, Plus, Menu, Bell, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

interface HeaderProps {
  showDashboardActions?: boolean
  currentPage?: string
}

export function Header({ showDashboardActions = false, currentPage }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <Waves className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">OpenDiving</h1>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-6">
              <Link
                href="/dashboard"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  currentPage === 'dashboard' ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dives"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  currentPage === 'dives' ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                My Dives
              </Link>
              <Link
                href="/sites"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  currentPage === 'sites' ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                Dive Sites
              </Link>
              <Link
                href="/community"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  currentPage === 'community' ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                Community
              </Link>
            </nav>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            {/* Search - Desktop */}
            <Button variant="ghost" size="sm" className="hidden md:flex">
              <Search className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                3
              </span>
            </Button>

            {/* Dashboard specific actions */}
            {showDashboardActions && (
              <>
                <Button variant="outline" size="sm" className="hidden sm:flex">
                  <Users className="h-4 w-4 mr-2" />
                  Find Buddies
                </Button>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Log Dive
                </Button>
              </>
            )}

            {/* Regular actions for non-dashboard pages */}
            {!showDashboardActions && (
              <>
                <Button variant="outline" size="sm" className="hidden sm:flex">
                  Sign In
                </Button>
                <Button size="sm">
                  Get Started
                </Button>
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
              <Link
                href="/dashboard"
                className="text-sm font-medium text-gray-700 hover:text-blue-600 py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                href="/dives"
                className="text-sm font-medium text-gray-700 hover:text-blue-600 py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                My Dives
              </Link>
              <Link
                href="/sites"
                className="text-sm font-medium text-gray-700 hover:text-blue-600 py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dive Sites
              </Link>
              <Link
                href="/community"
                className="text-sm font-medium text-gray-700 hover:text-blue-600 py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Community
              </Link>
              <div className="pt-3 border-t">
                <Button variant="outline" size="sm" className="w-full mb-2">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                {!showDashboardActions && (
                  <Button size="sm" className="w-full">
                    Get Started
                  </Button>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
