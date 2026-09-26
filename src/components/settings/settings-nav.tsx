"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ClipboardList,
  KeyRound,
  MailPlus,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from "lucide-react";

import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { cn } from "@/lib/utils";

interface SettingsSection {
  href: string;
  label: string;
  icon: LucideIcon;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "/settings/account", label: "Account", icon: User },
  { href: "/settings/checkin", label: "Check-in", icon: ClipboardList },
  {
    href: "/settings/authentication",
    label: "Authentication",
    icon: KeyRound,
  },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  {
    href: "/settings/preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { href: "/settings/invitations", label: "Invitations", icon: MailPlus },
];

// A column beside the section from `lg` up, and a row that scrolls sideways above it
// below that, so a phone keeps the section itself on the first screen.
export function SettingsNav() {
  const pathname = usePathname();
  const { config } = useInstanceConfig();
  const listRef = useRef<HTMLUListElement>(null);

  // On a phone the row is wider than the screen, and a section further along it would
  // otherwise open with its own entry out of sight. The row is scrolled rather than the
  // entry scrolled into view, which would move the page as well; where the list is a
  // column it has nothing to scroll and this does nothing.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector('[aria-current="page"]');
    if (!list || !current) return;
    const row = list.getBoundingClientRect();
    const entry = current.getBoundingClientRect();
    list.scrollLeft +=
      entry.left + entry.width / 2 - (row.left + row.width / 2);
  }, [pathname]);

  // An instance anyone may register on has nobody to invite. Hidden only once the
  // config says so: while it loads, or if it failed, the entry stays, because the
  // page behind it answers for itself either way.
  const sections = SETTINGS_SECTIONS.filter(
    (section) =>
      section.href !== "/settings/invitations" ||
      config?.registration_mode !== "open",
  );

  return (
    <nav aria-label="Settings" className="lg:sticky lg:top-24 lg:self-start">
      <ul
        ref={listRef}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {sections.map(({ href, label, icon: Icon }) => {
          const current = pathname === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  current
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
