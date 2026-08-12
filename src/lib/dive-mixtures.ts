// The shape a mixture form field starts from, and how a cylinder is named by its
// position. Pure data with no React in it, and imported by `lib/dive-import.ts` - which
// is why it lives here rather than in `mixture-fields.tsx`: a `lib` module reaching into
// a `"use client"` component to pull react-hook-form, lucide-react and three shadcn
// components along with two constants is the wrong direction.
//
// Re-exported from `mixture-fields.tsx` so existing call sites are unchanged.

// Default values pre-filled when a new mixture (tank) is added. Start/end
// pressure are deliberately left blank ("") rather than defaulted, since
// they vary per tank/fill and shouldn't be guessed.
export const DEFAULT_MIXTURE = {
  volume: 11.1,
  start_pressure: "" as const,
  end_pressure: "" as const,
  oxygen: 21.0,
  helium: 0,
};

// Default name for a mixture based on its position in the list: the first
// tank is assumed to be the "Back Gas", and every subsequent tank is a
// numbered "Deco Gas".
export function getDefaultMixtureName(index: number): string {
  return index === 0 ? "Back Gas" : `Deco Gas ${index}`;
}
