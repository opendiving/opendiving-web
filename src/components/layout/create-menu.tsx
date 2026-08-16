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

// The "+" sits on the way to the avatar and above the page's own actions, so a
// pointer crosses it without meaning anything by it. Waiting for the pointer to
// settle keeps a five-item menu from dropping into the path of a click aimed at
// something under it.
const HOVER_OPEN_DELAY_MS = 150;

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
  // True only while a menu the pointer opened is showing. A hover-opened menu
  // closes when the pointer leaves and never takes focus on the way in; a
  // clicked or keyed-open one stays until it's dismissed and focuses normally.
  const openedByHover = useRef(false);
  // Radix hands focus back to the trigger when the menu closes. That's only
  // right if the menu had focus to give back - it never does when the pointer
  // merely crossed the "+", and returning it anyway would pull the caret out of
  // whatever form the diver is filling in. Escape is the reason this is tracked
  // rather than derived from `openedByHover`: it dismisses from anywhere on the
  // page, through `onOpenChange`, which has already cleared that flag by the
  // time the focus handler runs.
  const menuTookFocus = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const cancelScheduledOpen = () => {
    if (openTimer.current === null) return;
    clearTimeout(openTimer.current);
    openTimer.current = null;
  };

  const cancelScheduledClose = () => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    return () => {
      if (openTimer.current !== null) clearTimeout(openTimer.current);
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  // Mice only. A tap fires `pointerenter` too, and a menu that opened from that
  // would be racing the tap's own click, which toggles it straight back shut.
  const handlePointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    cancelScheduledClose();
    // Re-entering an open menu has nothing to schedule, and mustn't relabel a
    // deliberate open as a hover - the next click would pin what is already
    // pinned instead of closing it.
    if (isOpen) return;
    cancelScheduledOpen();
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      openedByHover.current = true;
      menuTookFocus.current = false;
      setIsOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const handlePointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    // Whatever else this is, the pointer has left before the menu was due: a
    // crossing, not an approach.
    cancelScheduledOpen();
    if (!openedByHover.current) return;
    cancelScheduledClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      // Closing here rather than through `onOpenChange` keeps Radix's own close
      // handling out of it, so the flag has to be cleared by hand - a menu that
      // isn't showing was not opened by hover, and leaving it set would have
      // the pin below swallow the next tap.
      openedByHover.current = false;
      setIsOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  // Clicking the "+" is habit, and the hover has already opened the menu by the
  // time the click lands - Radix would read that as a toggle and dismiss the
  // very thing the click was aimed at. Pin it open instead: preventing the
  // default stops Radix's own toggle (it composes ours first), and dropping the
  // hover flag turns the peek into a deliberate open that outlives the pointer.
  const handlePointerDown = (event: PointerEvent) => {
    // Radix's toggle ignores everything but a plain primary press, so this has
    // to as well - a right-click that took the hover flag with it would leave
    // the menu with nothing to close it once the pointer left.
    if (event.button !== 0 || event.ctrlKey) return;
    // A click that beats the open delay is its own deliberate open: drop the
    // pending one so it can't land a moment later and relabel it a hover, and
    // leave the toggle to Radix.
    cancelScheduledOpen();
    if (!openedByHover.current) return;
    openedByHover.current = false;
    cancelScheduledClose();
    event.preventDefault();
    // That `preventDefault` is what stops Radix toggling the menu shut, but it
    // costs the press its focus too - and the menu's arrow keys, typeahead and
    // Enter all live on the content, which is portaled away from wherever focus
    // actually is. Pinning is a deliberate open, so it takes the focus a
    // deliberate open would have taken; `onFocusCapture` below picks that up,
    // so the close hands it back to the trigger.
    contentRef.current?.focus({ preventScroll: true });
  };

  // Everything Radix drives itself - the trigger's click, Enter/Space/ArrowDown,
  // Escape, a click outside, picking an item - is a deliberate open or close,
  // so nothing here is a hover any more.
  const handleOpenChange = (open: boolean) => {
    cancelScheduledOpen();
    cancelScheduledClose();
    openedByHover.current = false;
    if (open) menuTookFocus.current = false;
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
        ref={contentRef}
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
        // The pointer settling on an item focuses it (Radix's doing), so a menu
        // that started as a peek can still end up holding focus - and then it
        // owes it back. One that never took focus keeps its hands off.
        onFocusCapture={() => {
          menuTookFocus.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (!menuTookFocus.current) event.preventDefault();
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
