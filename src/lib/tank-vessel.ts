// A dive's cylinder and the gear item it is. The vessel's facts live on the gear item,
// and a tank linked to one shows the vessel's capacity in a read-only Volume box -
// these are the rules that box and the save share, so the figure the diver sees is
// the figure that is sent.

import type { GearItemInfo } from "@/lib/api/gear";

/** The members of a form row these rules read. */
export interface TankLink {
  volume?: number | "";
  gear_item_uuid?: string;
  gear_item?: GearItemInfo | null;
}

/**
 * The vessel a row links, or `null`. The uuid is the link; the embedded item is what
 * the row carries to show it, and counts only while it is the item the uuid names.
 */
export function linkedVessel(row: TankLink): GearItemInfo | null {
  if (!row.gear_item_uuid) return null;
  return row.gear_item?.uuid === row.gear_item_uuid ? row.gear_item : null;
}

/**
 * Whether a row's Volume box is read-only: while a link stands to a vessel that
 * records a capacity. A vessel without one leaves the box editable, there being
 * nothing to copy.
 */
export function isVolumeFromVessel(row: TankLink): boolean {
  return linkedVessel(row)?.volume != null;
}

/**
 * The volume a row shows and saves.
 *
 * The row's own figure wherever it has one - the vessel's for a link made in the form,
 * which copied it on the pick, and the document's for a link an import made, which
 * keeps its own. A linked row with none takes the vessel's, which overwrites nothing.
 */
export function tankVolume(row: TankLink): number | "" {
  if (typeof row.volume === "number") return row.volume;
  if (!isVolumeFromVessel(row)) return row.volume ?? "";
  return linkedVessel(row)!.volume!;
}

/**
 * The link a new dive's tank carries over from the same tank on the last dive, or
 * none.
 *
 * Archived vessels are skipped, as the prefill skips archived gear, and so is one
 * whose type is set and is no longer `cylinder`: a create sets every link it carries
 * as new, and the API refuses a new link to anything but a cylinder.
 */
export function carriedVessel(mixture: { gear_item?: GearItemInfo | null }): {
  gear_item_uuid: string;
  gear_item: GearItemInfo | null;
} {
  const item = mixture.gear_item;
  if (!item || item.is_archived || (item.type && item.type !== "cylinder")) {
    return { gear_item_uuid: "", gear_item: null };
  }
  return { gear_item_uuid: item.uuid, gear_item: item };
}
