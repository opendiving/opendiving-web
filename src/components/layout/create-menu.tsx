"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type PointerEvent,
} from "react";
import {
  Plus,
  Waves,
  MapPin,
  Luggage,
  Backpack,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useQuickCreate,
  type QuickCreateKind,
} from "@/components/layout/quick-create";
import { isFormPath } from "@/lib/return-to";

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
];

// The create menu is reachable from every page, so the form it opens is told
// where it was launched from - otherwise its Back/Cancel would guess. Nothing is
// appended when the current page is itself a form (see `isFormPath`), which
// would otherwise send Cancel straight back to the form being cancelled.
function withReturnTo(href: string, pathname: string | null): string {
  if (!pathname || isFormPath(pathname)) return href;
  return `${href}?from=${encodeURIComponent(pathname)}`;
}

// The menu sits 4px below the trigger, so a pointer travelling between the two
// is briefly over neither. Closing on a delay rides out that gap instead of
// flickering the menu shut halfway to it.
const HOVER_CLOSE_DELAY_MS = 150;

// Radix reserves `onOpenAutoFocus` for its own menu internals and omits it from
// the public content props, but it's spread through to the focus scope
// untouched - so it's a working escape hatch, just an untyped one. Nothing
// short of it can stop a hover-opened menu from taking focus.
const HoverableDropdownMenuContent = DropdownMenuContent as ComponentType<
  ComponentProps<typeof DropdownMenuContent> & {
    onOpenAutoFocus?: (event: Event) => void;
  }
>;

// The "+" in the header: hovering opens it, clicking and the keyboard still
// work exactly as they did.
export function CreateMenu() {
  const openCreate = useQuickCreate();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  // A hover-opened menu is closed and focused differently from a deliberate
  // one: hovering away closes it (a click-opened menu stays put until it's
  // dismissed), and it never takes focus, since the pointer only passing over
  // the "+" shouldn't pull the caret out of whatever the diver is filling in.
  const openedByHover = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const cancelScheduledClose = () => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  // Mice only. A tap fires `pointerenter` too, and opening on it would race the
  // tap's own click, which toggles the menu straight back shut.
  const handlePointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    cancelScheduledClose();
    // Only the hover that *opens* the menu counts. The pointer wandering back
    // over an already-open one mustn't relabel a deliberate open as a hover,
    // which would leave the next click pinning a menu that's already pinned
    // instead of closing it.
    if (!isOpen) openedByHover.current = true;
    setIsOpen(true);
  };

  const handlePointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !openedByHover.current) return;
    cancelScheduledClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setIsOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  // Clicking the "+" is habit, and the hover has already opened the menu by the
  // time the click lands - Radix would read that as a toggle and dismiss the
  // very thing the click was aimed at. Pin it open instead: preventing the
  // default stops Radix's own toggle (it composes ours first), and dropping the
  // hover flag turns the peek into a deliberate open that outlives the pointer.
  const handlePointerDown = (event: PointerEvent) => {
    if (!openedByHover.current) return;
    openedByHover.current = false;
    cancelScheduledClose();
    event.preventDefault();
  };

  // Everything Radix drives itself - the trigger's click, Enter/Space/ArrowDown,
  // Escape, a click outside, picking an item - is deliberate, so it gets the
  // normal focus handling back. Note this also runs on those closes, which is
  // what hands focus back to the trigger after an item is picked.
  const handleOpenChange = (open: boolean) => {
    cancelScheduledClose();
    openedByHover.current = false;
    setIsOpen(open);
  };

  return (
    // `modal` off: the menu can now open under a pointer that's merely passing
    // through, and a modal one would block pointer events on the rest of the
    // page - including the `pointerleave` that closes it again.
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={false}>
      {/* The pointer handlers belong on the trigger, not on the `Button` it
          renders: Radix composes a trigger's own props with its internal ones
          and stops at a `preventDefault`, while `asChild` merges a child's
          handlers unconditionally - so a pointer-down handler on the `Button`
          could never head off the trigger's toggle. */}
      <DropdownMenuTrigger
        asChild
        ref={triggerRef}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <Button variant="ghost" size="sm" aria-label="Create new">
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <HoverableDropdownMenuContent
        align="end"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        // A menu that isn't modal counts its own trigger as outside itself, so
        // it dismisses on the way down of the click the handler above is busy
        // pinning. Closing on a second click is the trigger's job either way.
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (target instanceof Node && triggerRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
      >
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
      </HoverableDropdownMenuContent>
    </DropdownMenu>
  );
}
