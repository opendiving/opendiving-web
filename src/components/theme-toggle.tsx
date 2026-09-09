"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ACTIVE_ICONS = {
  light: Sun,
  dark: Moon,
} as const;

// The theme choices, for dropping into whichever menu is showing them - the
// user menu when signed in, `ThemeToggle`'s own dropdown when signed out.
//
// Bound to `theme` rather than `resolvedTheme` so the selection shows what was
// actually chosen: "System" stays checked at night instead of reading as "Dark".
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Appearance
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        // Before mount there is no resolved preference, and guessing one would
        // flash the wrong radio as checked.
        value={mounted ? theme : undefined}
        onValueChange={setTheme}
      >
        <DropdownMenuRadioItem value="light">
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}

// Standalone theme control, used where there's no user menu to hang the choices
// off - i.e. signed out.
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();

  const ActiveIcon =
    mounted && resolvedTheme && resolvedTheme in ACTIVE_ICONS
      ? ACTIVE_ICONS[resolvedTheme as keyof typeof ACTIVE_ICONS]
      : Sun;

  return (
    <DropdownMenu>
      <IconTooltip label="Toggle theme">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={className}>
            <ActiveIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Avoid rendering theme-dependent UI until mounted, since the resolved theme
// isn't known on the server and would otherwise cause a hydration mismatch.
function useMounted() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return mounted;
}
