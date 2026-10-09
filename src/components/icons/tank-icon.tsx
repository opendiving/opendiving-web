import {
  createLucideIcon,
  type IconNode,
  type LucideProps,
} from "lucide-react";

export type TankGas = "air" | "nitrox" | "oxygen" | "trimix";

// The US medical-gas colours (CGA C-9), which dive shops borrow: oxygen is green, so an
// oxygen cylinder is green all over and a nitrox one carries a green band. Helium is
// brown there and under EN 1089-3 alike, so a trimix cylinder is brown at the shoulder
// and green at the base. Strokes stay `currentColor`; the fills come first so every line sits on top of them.
const OXYGEN = "fill-green-500";
const HELIUM = "fill-amber-700 dark:fill-amber-600";

// One cylinder's outline, the shoulder above its top band line, its band - the part
// between the y=11 and y=17 lines - and the base below the band.
interface Cylinder {
  outline: string;
  shoulder: string;
  band: string;
  base: string;
}

function fill(d: string, className: string, key: string): IconNode[number] {
  return ["path", { d, stroke: "none", className, key }];
}

function fills(gas: TankGas, cylinder: Cylinder, key: string): IconNode {
  switch (gas) {
    case "air":
      return [];
    case "nitrox":
      return [fill(cylinder.band, OXYGEN, `${key}-band`)];
    case "oxygen":
      return [fill(cylinder.outline, OXYGEN, `${key}-fill`)];
    case "trimix":
      return [
        fill(cylinder.shoulder, HELIUM, `${key}-shoulder`),
        fill(cylinder.base, OXYGEN, `${key}-base`),
      ];
  }
}

const TWIN_LEFT: Cylinder = {
  outline: "M10 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
  shoulder: "M10 11v-1a4 4 0 0 0-8 0v1Z",
  band: "M2 11h8v6H2Z",
  base: "M2 17h8v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
};
const TWIN_RIGHT: Cylinder = {
  outline: "M22 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
  shoulder: "M22 11v-1a4 4 0 0 0-8 0v1Z",
  band: "M14 11h8v6h-8Z",
  base: "M14 17h8v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z",
};
// The twin's cylinder, moved left to leave room for the hose.
const SINGLE_CYLINDER: Cylinder = {
  outline: "M13 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
  shoulder: "M13 11v-1a4 4 0 0 0-8 0v1Z",
  band: "M5 11h8v6H5Z",
  base: "M5 17h8v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z",
};
// The single's cylinder mirrored, its hose on the left.
const LEFT_CYLINDER: Cylinder = {
  outline: "M19 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
  shoulder: "M19 11v-1a4 4 0 0 0-8 0v1Z",
  band: "M11 11h8v6h-8Z",
  base: "M11 17h8v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z",
};

// Lucide's `fire-extinguisher` without its hose and nozzle, drawn twice: two cylinders
// whose valves are joined by what was its handle - a twin set on a manifold, held by
// two bands across both cylinders.
function twinTank(gas: TankGas): IconNode {
  return [
    ...fills(gas, TWIN_LEFT, "cylinder-l"),
    ...fills(gas, TWIN_RIGHT, "cylinder-r"),
    [
      "path",
      { d: "M8 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5", key: "valve-l" },
    ],
    [
      "path",
      { d: "M20 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5", key: "valve-r" },
    ],
    ["path", { d: "M8 3h8", key: "manifold" }],
    ["path", { d: "M2 3h2", key: "knob-l" }],
    ["path", { d: "M20 3h2", key: "knob-r" }],
    ["path", { d: "M2 11h20", key: "band-top" }],
    ["path", { d: "M2 17h20", key: "band-bottom" }],
    ["path", { d: TWIN_LEFT.outline, key: "cylinder-l" }],
    ["path", { d: TWIN_RIGHT.outline, key: "cylinder-r" }],
  ];
}

// One cylinder of the twin set with `fire-extinguisher`'s hose, mirrored to the right
// and ending in a gauge.
function singleTank(gas: TankGas): IconNode {
  return [
    ...fills(gas, SINGLE_CYLINDER, "cylinder"),
    [
      "path",
      { d: "M11 6.5V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v3.5", key: "valve" },
    ],
    ["path", { d: "M5 3h2", key: "knob" }],
    ["path", { d: "M11 3a6 6 0 0 1 6 6v7", key: "hose" }],
    ["circle", { cx: "17", cy: "18", r: "2", key: "gauge" }],
    ["path", { d: "M5 11h8", key: "band-top" }],
    ["path", { d: "M5 17h8", key: "band-bottom" }],
    ["path", { d: SINGLE_CYLINDER.outline, key: "cylinder" }],
  ];
}

// The single mirrored, with a shorter hose: the left of a parallel pair, beside the
// single as its right.
function leftTank(gas: TankGas): IconNode {
  return [
    ...fills(gas, LEFT_CYLINDER, "cylinder"),
    [
      "path",
      { d: "M17 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5", key: "valve" },
    ],
    ["path", { d: "M17 3h2", key: "knob" }],
    ["path", { d: "M13 3a6 6 0 0 0-6 6", key: "hose" }],
    ["circle", { cx: "7", cy: "11", r: "2", key: "gauge" }],
    ["path", { d: "M11 11h8", key: "band-top" }],
    ["path", { d: "M11 17h8", key: "band-bottom" }],
    ["path", { d: LEFT_CYLINDER.outline, key: "cylinder" }],
  ];
}

const GASES: TankGas[] = ["air", "nitrox", "oxygen", "trimix"];

function iconsFor(name: string, node: (gas: TankGas) => IconNode) {
  return Object.fromEntries(
    GASES.map((gas) => [
      gas,
      createLucideIcon({
        name: gas === "air" ? name : `${name}-${gas}`,
        size: 24,
        node: node(gas),
      }),
    ]),
  ) as Record<TankGas, ReturnType<typeof createLucideIcon>>;
}

const TWIN = iconsFor("twin-tank", twinTank);
const SINGLE = iconsFor("tank", singleTank);
const LEFT = iconsFor("left-tank", leftTank);

interface TankIconProps extends LucideProps {
  gas?: TankGas;
}

export function TwinTankIcon({ gas = "air", ...props }: TankIconProps) {
  const Icon = TWIN[gas];
  return <Icon {...props} />;
}

export function TankIcon({ gas = "air", ...props }: TankIconProps) {
  const Icon = SINGLE[gas];
  return <Icon {...props} />;
}

export function LeftTankIcon({ gas = "air", ...props }: TankIconProps) {
  const Icon = LEFT[gas];
  return <Icon {...props} />;
}
