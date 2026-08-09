import { apiClient } from "./client";

// Broad category a gear item falls into. Mirrors the API's `GearType` enum -
// a closed vocabulary rather than free text, so the same kind of kit is named
// the same way across a diver's whole list and the UI can group by it.
//
// Declared in the order kit is normally listed rather than alphabetically:
// `GEAR_TYPES` is what drives the picker's option order, so "Mask, Snorkel,
// Fins..." reads the way a diver would lay their kit out rather than
// "BCD, Boots, Camera...". Keep in sync with the API.
export const GEAR_TYPES = [
  "mask",
  "snorkel",
  "fins",
  "wetsuit",
  "drysuit",
  "vest",
  "hood",
  "gloves",
  "boots",
  "bcd",
  "regulator",
  "computer",
  "cylinder",
  "light",
  "smb",
  "reel",
  "knife",
  "compass",
  "camera",
  "other",
] as const;

export type GearType = (typeof GEAR_TYPES)[number];

// Display labels. Most are just the capitalized value, but the acronyms and
// multi-word ones (BCD, SMB, "Dive computer") would read badly if derived.
const GEAR_TYPE_LABELS: Record<GearType, string> = {
  mask: "Mask",
  snorkel: "Snorkel",
  fins: "Fins",
  wetsuit: "Wetsuit",
  drysuit: "Drysuit",
  vest: "Vest",
  hood: "Hood",
  gloves: "Gloves",
  boots: "Boots",
  bcd: "BCD",
  regulator: "Regulator",
  computer: "Dive computer",
  cylinder: "Cylinder",
  light: "Light",
  smb: "SMB",
  reel: "Reel",
  knife: "Knife",
  compass: "Compass",
  camera: "Camera",
  other: "Other",
};

// Label for a gear type, tolerating a value this build doesn't know about (an
// API that has grown a new category shouldn't render as a blank cell).
export function gearTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return GEAR_TYPE_LABELS[type as GearType] ?? type;
}

// A single piece of diving equipment (regulator, BCD, drysuit, computer, ...).
export interface GearItem {
  uuid: string;
  name: string;
  brand?: string | null;
  type?: GearType | null;
  notes?: string;
  rented: boolean;
  // Archived gear stays on past dives and in sets, but is hidden from the dive
  // form's picker - the non-destructive way to retire gear you no longer use.
  is_archived: boolean;
  archived_at?: string | null;
  // Number of the owner's dives this item was used on, maintained by the API
  // after every dive create/update/delete.
  dive_count: number;
  user_uuid: string;
  created_at: string;
}

// The summary shape embedded in a `Dive` or a `GearSet`.
export interface GearItemSummary {
  uuid: string;
  name: string;
  brand?: string | null;
  type?: GearType | null;
  rented: boolean;
  is_archived: boolean;
}

export interface GearItemCreate {
  user_uuid: string;
  name: string;
  brand?: string;
  type?: GearType;
  notes?: string;
  rented?: boolean;
}

export interface GearItemUpdate {
  name?: string;
  brand?: string | null;
  type?: GearType | null;
  notes?: string;
  rented?: boolean;
  is_archived?: boolean;
}

// A named, reusable grouping of gear items ("Sidemount", "Tech - trimix", ...).
// Sets are a form-filling shortcut only: a dive stores the resulting items, never
// the set, so editing or deleting a set never rewrites logged dives.
export interface GearSet {
  uuid: string;
  name: string;
  gear_items: GearItemSummary[];
  user_uuid: string;
  created_at: string;
}

export interface GearSetCreate {
  user_uuid: string;
  name: string;
  gear_item_uuids: string[];
}

export interface GearSetUpdate {
  name?: string;
  gear_item_uuids?: string[];
}

export interface PaginatedGearItemsResponse {
  data: GearItem[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export interface PaginatedGearSetsResponse {
  data: GearSet[];
  total_count: number;
  has_more: boolean;
  page: number;
  items_per_page: number;
}

export const gearAPI = {
  // Create a gear item. `data.user_uuid` must be the currently signed-in user's uuid.
  async createGearItem(data: GearItemCreate): Promise<GearItem> {
    const response = await apiClient.post(`/gear-item`, data);
    return response.data;
  },

  // Get a user's gear (paginated). Archived items are excluded unless
  // `includeArchived` is true, so pickers only ever offer gear still in service.
  async getGearItems(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    includeArchived: boolean = false,
  ): Promise<PaginatedGearItemsResponse> {
    const response = await apiClient.get(`/gear-items`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        include_archived: includeArchived,
      },
    });
    return response.data;
  },

  async getGearItem(gearItemUuid: string): Promise<GearItem> {
    const response = await apiClient.get(`/gear-item/${gearItemUuid}`);
    return response.data;
  },

  // Update a gear item. Pass `is_archived` to archive/unarchive it - the API
  // derives the `archived_at` timestamp itself.
  async updateGearItem(
    gearItemUuid: string,
    updateData: GearItemUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/gear-item/${gearItemUuid}`,
      updateData,
    );
    return response.data;
  },

  async deleteGearItem(gearItemUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/gear-item/${gearItemUuid}`);
    return response.data;
  },

  async createGearSet(data: GearSetCreate): Promise<GearSet> {
    const response = await apiClient.post(`/gear-set`, data);
    return response.data;
  },

  async getGearSets(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedGearSetsResponse> {
    const response = await apiClient.get(`/gear-sets`, {
      params: { user_uuid: userUuid, page, items_per_page },
    });
    return response.data;
  },

  async getGearSet(gearSetUuid: string): Promise<GearSet> {
    const response = await apiClient.get(`/gear-set/${gearSetUuid}`);
    return response.data;
  },

  // Update a gear set. Passing `gear_item_uuids` replaces its members wholesale.
  async updateGearSet(
    gearSetUuid: string,
    updateData: GearSetUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(
      `/gear-set/${gearSetUuid}`,
      updateData,
    );
    return response.data;
  },

  async deleteGearSet(gearSetUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/gear-set/${gearSetUuid}`);
    return response.data;
  },
};

// Fetches every page of a user's gear. The dive form's picker and the gear set
// editor filter client-side over the full list rather than paging, so a user with
// more than one page of gear would otherwise see items render as bare uuids.
// Mirrors the same loop in `DiveSiteMultiSelect`.
export async function fetchAllGearItems(
  userUuid: string,
  includeArchived: boolean = false,
): Promise<GearItem[]> {
  const all: GearItem[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await gearAPI.getGearItems(
      userUuid,
      page,
      100,
      includeArchived,
    );
    all.push(...response.data);
    hasMore = response.has_more;
    page += 1;
  }
  return all;
}

// Fetches every page of a user's gear sets - same reasoning as `fetchAllGearItems`
// (the dive form's set switcher is a client-side-filtered dropdown, not a list view).
export async function fetchAllGearSets(userUuid: string): Promise<GearSet[]> {
  const all: GearSet[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await gearAPI.getGearSets(userUuid, page, 100);
    all.push(...response.data);
    hasMore = response.has_more;
    page += 1;
  }
  return all;
}

// Human-readable label for a gear item, e.g. "Scubapro MK25 EVO" or just "Wing 17L".
export function gearItemLabel(item: {
  name: string;
  brand?: string | null;
}): string {
  return item.brand ? `${item.brand} ${item.name}` : item.name;
}
