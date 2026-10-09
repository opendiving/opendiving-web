import { cn } from "@/lib/utils";

// A place's marker over the trip form's live map, as the element MapLibre
// positions, and over the tiles a card or a page head composes; the site
// picker's pin is its own. Its own module, importing nothing from `maplibre-gl`,
// so the tile maps carry none of GL JS in their bundles.
//
// `bg-coral`, not `bg-primary`: primary is near-black in light and mid-grey in
// dark, which is invisible against a dark basemap. Coral is the one accent held
// constant across both themes. The ring is the page's colour, standing in for
// the land of the map under it, unless that map names its own in
// `--marker-ring`.
//
// A fix inverts the same two colours rather than changing size or hue: same
// coral, same 12px, so the pair reads as one legend where a second colour would
// read as a second meaning. The tinted rather than transparent centre is what
// keeps the ring a ring over a busy coastline in either theme.
export const markerClassName = (variant: "pin" | "fix") =>
  cn(
    "h-3 w-3 rounded-full border-2 shadow",
    variant === "fix"
      ? "border-coral bg-background/80"
      : "border-[color:var(--marker-ring,hsl(var(--background)))] bg-coral",
  );
