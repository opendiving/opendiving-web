import { createLucideIcon } from "lucide-react";

// Lucide's `map-pin` with the brand mark's rising bubbles in place of its inner circle -
// two of them, since three run together in a pin 16px high. They rise at the mark's
// angle, clearing each other and the pin by the same distance at lucide's 2px stroke;
// the smaller is solid and unstroked so its size is exact.
export const DiveSiteIcon = createLucideIcon({
  name: "dive-site",
  size: 24,
  node: [
    [
      "path",
      {
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
        key: "pin",
      },
    ],
    [
      "circle",
      {
        cx: "9.9",
        cy: "13.74",
        r: "2",
        fill: "currentColor",
        stroke: "none",
        key: "bubble-s",
      },
    ],
    ["circle", { cx: "14.02", cy: "8.64", r: "2.2", key: "bubble-l" }],
  ],
});
