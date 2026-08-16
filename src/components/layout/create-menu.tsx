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
  // Whatever had focus when the pointer opened the menu, so the close can put
  // it back. Radix hands focus to the trigger instead, which is right for a
  // menu the diver asked for and wrong for one they only hovered: the caret
  // ends up on a header button rather than in the form they were filling in.
  // Even a peek can take focus on the way past - Radix focuses whichever item
  // the pointer crosses - so "did it take focus" isn't enough to decide, and
  // neither is `openedByHover`: Escape dismisses through `onOpenChange`, which
  // clears that flag before the focus handler runs. Null means a deliberate
  // open, which gets Radix's own handling.
  const hoverOpenOrigin = useRef<HTMLElement | null>(null);
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
      hoverOpenOrigin.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
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
    // Any press means the pointer is deliberately here, so a hover-open still
    // counting down has been superseded - including by a press Radix ignores,
    // which would otherwise drop the menu open under a context menu.
    cancelScheduledOpen();
    // Radix's toggle ignores everything but a plain primary press, so this has
    // to as well - a right-click that took the hover flag with it would leave
    // the menu with nothing to close it once the pointer left.
    if (event.button !== 0 || event.ctrlKey) return;
    if (!openedByHover.current) return;
    openedByHover.current = false;
    hoverOpenOrigin.current = null;
    cancelScheduledClose();
    event.preventDefault();
    // That `preventDefault` is what stops Radix toggling the menu shut, but it
    // costs the press its focus too - and the menu's arrow keys, typeahead and
    // Enter all live on the content, which is portaled away from wherever focus
    // actually is. Pinning is a deliberate open, so it takes the focus a
    // deliberate open would have taken, and gives it back to the trigger on the
    // way out like any other.
    contentRef.current?.focus({ preventScroll: true });
  };

  // Everything Radix drives itself - the trigger's click, Enter/Space/ArrowDown,
  // Escape, a click outside, picking an item - is a deliberate open or close,
  // so nothing here is a hover any more.
  const handleOpenChange = (open: boolean) => {
    cancelScheduledOpen();
    cancelScheduledClose();
    openedByHover.current = false;
    // Only on the way open: the close handler still has to read the origin of
    // the menu that is closing, and it runs after this.
    if (open) hoverOpenOrigin.current = null;
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
        // A menu the pointer opened gives focus back where it found it, rather
        // than to the "+" - the diver never asked for this menu, and may well
        // have been mid-sentence in a form when it appeared. Anything else gets
        // Radix's own handling, which is the trigger.
        onCloseAutoFocus={(event) => {
          const origin = hoverOpenOrigin.current;
          if (!origin) return;
          event.preventDefault();
          if (origin.isConnected) origin.focus({ preventScroll: true });
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
