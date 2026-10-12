import type { LucideProps } from "lucide-react";
import {
  LeftTankIcon,
  TankIcon,
  TwinTankIcon,
} from "@/components/icons/tank-icon";
import { isTwinSetVolume } from "@/components/dives/volume-combobox";
import { tankGas } from "@/lib/dive-mixtures";

interface MixtureTankIconProps extends LucideProps {
  volume: number | null | undefined;
  oxygen: number | null | undefined;
  helium: number | null | undefined;
  // The first cylinder flagged parallel, drawn as the left of the pair.
  left: boolean;
}

// One cylinder drawn from what it records, on the dive page and in the form alike. A
// twin set is recorded as one cylinder holding a twin-set preset's litres; anything
// else, an unrecorded volume included, is a single. An unrecorded or unnameable mix
// is drawn as air.
export function MixtureTankIcon({
  volume,
  oxygen,
  helium,
  left,
  ...props
}: MixtureTankIconProps) {
  const Icon = left
    ? LeftTankIcon
    : isTwinSetVolume(volume)
      ? TwinTankIcon
      : TankIcon;

  return <Icon gas={tankGas(oxygen, helium)} aria-hidden {...props} />;
}
