import { createLucideIcon } from "lucide-react";

// Lucide's `fire-extinguisher` without its hose and nozzle, drawn twice: two cylinders
// whose valves are joined by what was its handle - a twin set on a manifold, held by
// two bands across both cylinders.
export const TwinTankIcon = createLucideIcon({
  name: "twin-tank",
  size: 24,
  node: [
    [
      "path",
      { d: "M8 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5", key: "valve-l" },
    ],
    [
      "path",
      { d: "M20 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5", key: "valve-r" },
    ],
    ["path", { d: "M8 3h8", key: "manifold" }],
    ["path", { d: "M2 14h20", key: "band-top" }],
    ["path", { d: "M2 18h20", key: "band-bottom" }],
    [
      "path",
      {
        d: "M10 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
        key: "cylinder-l",
      },
    ],
    [
      "path",
      {
        d: "M22 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
        key: "cylinder-r",
      },
    ],
  ],
});
