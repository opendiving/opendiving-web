import { createLucideIcon } from "lucide-react";

// Lucide's `map-plus` with its plus replaced by `map-pin-search`'s magnifier, which
// sits in the corner the map's outline already leaves open for it.
export const MapSearchIcon = createLucideIcon({
  name: "map-search",
  size: 24,
  node: [
    [
      "path",
      {
        d: "m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V12",
        key: "map",
      },
    ],
    ["path", { d: "M15 5.764V12", key: "fold-r" }],
    ["path", { d: "M9 3.236v15", key: "fold-l" }],
    ["circle", { cx: "18", cy: "18", r: "3", key: "lens" }],
    ["path", { d: "m22 22-1.88-1.88", key: "handle" }],
  ],
});
