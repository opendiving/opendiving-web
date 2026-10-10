import {
  Backpack,
  CloudSun,
  FileText,
  Fish,
  Gauge,
  GraduationCap,
  Import as ImportIcon,
  MapPin,
  Users,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import { TwinTankIcon } from "@/components/icons/tank-icon";
import type { DiveFormFieldGroup } from "@/lib/dive-form-fields";
import { cn } from "@/lib/utils";

// One glyph per section of the dive, the same on the form's headings, in its
// section index and on the dive page's cards: a reader who learns the mark once
// finds the section by it everywhere. Tanks keeps the dive page's twin set rather
// than taking a generic cylinder, so the two pages cannot disagree on it.
//
// Here rather than beside the groups in `lib/`, because the map holds components
// and one of them is this repo's own.
export const DIVE_SECTION_ICONS: Readonly<
  Record<DiveFormFieldGroup, ComponentType<LucideProps>>
> = {
  Import: ImportIcon,
  Training: GraduationCap,
  Location: MapPin,
  People: Users,
  "Dive info": Gauge,
  Environment: CloudSun,
  Tanks: TwinTankIcon,
  Gear: Backpack,
  "Marine life": Fish,
  Notes: FileText,
};

interface DiveSectionIconProps {
  group: DiveFormFieldGroup;
  className?: string;
}

// The section's glyph, decorative: the heading or entry beside it carries the name.
export function DiveSectionIcon({ group, className }: DiveSectionIconProps) {
  const Icon = DIVE_SECTION_ICONS[group];
  return (
    <Icon aria-hidden="true" className={cn("h-5 w-5 shrink-0", className)} />
  );
}
