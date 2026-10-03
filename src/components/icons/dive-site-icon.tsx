import { createLucideIcon, type LucideIconNode } from "lucide-react";

// Lucide's `map-pin`, with the brand mark's rising bubbles in place of its inner circle.
// In both drawings below the bubbles rise on one straight line at the mark's angle, each
// clearing its neighbours and the pin by the same distance.
const pin: LucideIconNode = [
  "path",
  {
    d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    key: "pin",
  },
];

// Drawn for lucide's 2px stroke, at which three bubbles run together in a pin 16px
// high: two instead, the smaller solid and unstroked so its size is exact.
export const DiveSiteIcon = createLucideIcon({
  name: "dive-site",
  size: 24,
  node: [
    pin,
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

// The bubbles as the mark draws them - two rings and a dot - which only have room at
// the 1.5 stroke a map hero draws its icon at. All three are stroked, so the gaps stay
// equal whatever the stroke. The dot is filled under its stroke, and its radius must
// stay above a quarter of the stroke width: at exactly a quarter the stroke's inner
// hole meets the fill's edge and the seam shows as a ring.
export const DiveSiteHeroIcon = createLucideIcon({
  name: "dive-site-hero",
  size: 24,
  node: [
    pin,
    [
      "circle",
      {
        cx: "9.01",
        cy: "15.18",
        r: "0.6",
        fill: "currentColor",
        key: "bubble-s",
      },
    ],
    ["circle", { cx: "11.58", cy: "11.99", r: "1.3", key: "bubble-m" }],
    ["circle", { cx: "15.04", cy: "7.72", r: "2", key: "bubble-l" }],
  ],
});
