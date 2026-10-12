import { createLucideIcon } from "lucide-react";

// A wrist dive computer with a rising bar graph on its screen, which is wider than
// tall as a Shearwater Perdix's is. The bars' pitch equals the face's corner radius,
// 3.5, and the outer caps are concentric with the corners, so every gap - bar to bar,
// bar to face - is 3.5 less the stroke, at 1.5px and at 2px alike. A fourth bar
// would stretch the face further, and crowds at 16px.
export const DiveComputerIcon = createLucideIcon({
  name: "dive-computer",
  size: 24,
  node: [
    [
      "rect",
      { x: "5", y: "6", width: "14", height: "12", rx: "3.5", key: "face" },
    ],
    ["path", { d: "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2", key: "strap-top" }],
    [
      "path",
      { d: "M9 18v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2", key: "strap-bottom" },
    ],
    ["path", { d: "M8.5 14.5v-2", key: "bar-1" }],
    ["path", { d: "M12 14.5v-3.5", key: "bar-2" }],
    ["path", { d: "M15.5 14.5v-5", key: "bar-3" }],
  ],
});
