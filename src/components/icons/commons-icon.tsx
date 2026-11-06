import { createLucideIcon } from "lucide-react";

// The brand mark's three bubbles gathered instead of rising, for a site every
// account shares. The solid one is the mark's smallest, as there. Each carries the
// stroke, so all three gaps stay equal at any stroke width.
export const CommonsIcon = createLucideIcon({
  name: "commons",
  size: 24,
  node: [
    [
      "circle",
      {
        cx: "7.11",
        cy: "15.13",
        r: "2.81",
        fill: "currentColor",
        key: "bubble-s",
      },
    ],
    ["circle", { cx: "16.33", cy: "17.63", r: "3.37", key: "bubble-m" }],
    ["circle", { cx: "13.58", cy: "7.12", r: "4.12", key: "bubble-l" }],
  ],
});
