/**
 * Custom properties: the diver's own key-value pairs on a record, for what no
 * field holds - a dive computer's firmware, a trip's booking reference. Every
 * record a diver owns carries `custom_properties` (`schemas/custom_property.py`
 * in the API), in the order the diver wrote them; a write replaces the list.
 */
export interface CustomProperty {
  key: string;
  value: string;
}

// The API's bounds.
export const CUSTOM_PROPERTY_KEY_MAX = 100;
export const CUSTOM_PROPERTY_VALUE_MAX = 1000;
export const CUSTOM_PROPERTIES_MAX = 50;

/**
 * The list as the API takes it: each member trimmed, and a row left blank on
 * both sides dropped - the empty row a diver added and never filled.
 */
export function normalizeCustomProperties(
  rows: CustomProperty[],
): CustomProperty[] {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
    .filter((row) => row.key || row.value);
}

/** Two keys the API takes for one: compared trimmed and ignoring case. */
export function customPropertyKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * What an edit sends for the list: the form's rows as the API takes them, or
 * nothing at all where the record was read without the member - a response
 * cached before custom properties existed - and the diver added none. Sending
 * `[]` there would clear properties written since by another client.
 */
export function customPropertiesUpdate(
  stored: CustomProperty[] | undefined,
  rows: CustomProperty[] | undefined,
): CustomProperty[] | undefined {
  const sent = normalizeCustomProperties(rows ?? []);
  return stored === undefined && sent.length === 0 ? undefined : sent;
}
