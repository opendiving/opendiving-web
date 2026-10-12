import { createLucideIcon } from "lucide-react";

// A wrist dive computer with a rising bar graph on its face. Square rather than
// lucide's round `watch`, whose face has no room for three bars. The bars sit on a
// 3-unit pitch, so every gap - bar to bar, bar to face - is 3 less the stroke, and
// the face's 3-unit corners are concentric with the outer bars' caps: one gap
// everywhere, at 1.5px and at 2px alike.
export const DiveComputerIcon = createLucideIcon({
  name: "dive-computer",
  size: 24,
  node: [
    [
      "rect",
      { x: "6", y: "6", width: "12", height: "12", rx: "3", key: "face" },
    ],
    ["path", { d: "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2", key: "strap-top" }],
    [
      "path",
      { d: "M9 18v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2", key: "strap-bottom" },
    ],
    ["path", { d: "M9 15v-2", key: "bar-1" }],
    ["path", { d: "M12 15v-4", key: "bar-2" }],
    ["path", { d: "M15 15v-6", key: "bar-3" }],
  ],
});
