// How a species reads on screen. Composed once here because the two surfaces
// that show one - the dive form's picker and the dive page's card - have to
// agree on the same two decisions: what to call a species that has no common
// name, and how to say that a row is not a species at all.

interface NamedSpecies {
  scientific_name: string;
  common_name: string | null;
}

interface RankedSpecies extends NamedSpecies {
  rank: string;
}

/**
 * What to call this species, given that most of the ocean has no English name.
 *
 * The common name when there is one, the scientific name otherwise - never an
 * empty string or a placeholder. `common_name` is genuinely often null (WoRMS
 * carries a single Japanese vernacular for the clownfish, and Wikidata's English
 * label for it *is* the binomial), so the fallback is the normal case for
 * anything that isn't charismatic megafauna, not an error path.
 */
export function speciesDisplayName(species: NamedSpecies): string {
  return species.common_name ?? species.scientific_name;
}

/**
 * The scientific name to show *beside* the display name, or `undefined` when it
 * would just repeat it.
 *
 * Exists so a caller can decide with `&&` whether to render the italic
 * second half of a row at all: when the display name already is the scientific
 * name, printing it twice is noise.
 */
export function speciesSecondaryName(
  species: NamedSpecies,
): string | undefined {
  return species.common_name ? species.scientific_name : undefined;
}

/**
 * The rank, when it is worth showing at all.
 *
 * `rank` is mostly WoRMS's open vocabulary passed through unmodified, but a
 * literal `"unknown"` is not a rank - it is the API's placeholder for "no rank
 * to report", and it has **two** writers (`species_service.py`'s
 * `_wikidata_result` and `_worms_taxon`). A Wikidata-only search hit has no
 * WoRMS record behind it to take a taxonomy from; and a WoRMS record that simply
 * arrived without the field gets the same value, because `rank` is a NOT NULL
 * column and the API would rather store the sentinel than refuse an otherwise
 * good record. Printed as-is it renders "Manta americana, unknown", which reads
 * as a statement about the animal rather than about how much is known, so it is
 * dropped alongside the blank.
 *
 * That second writer is the one worth remembering, because it is the reason this
 * is not a picker-only concern: resolve won't invent a row without the
 * authoritative record, but the authoritative record itself may omit the rank -
 * so a catalog row can carry the sentinel, and the dive detail card's
 * `speciesNameWithRank` is a live guard rather than a defensive one.
 *
 * Nothing upstream to fix, and no better value to pass through: the API's merge
 * treats the sentinel as a placeholder rather than a claim, so a real rank from
 * either source displaces it, and making it nullable would mean a search hit and
 * the catalog row it becomes disagreed about whether the field is optional.
 * Dropping it here is the display half of that split.
 *
 * How much of a search page carries it is not a property of the data and gets no
 * number here: search answers with whatever arrived inside its fan-out budget,
 * so a slow minute at WoRMS leaves more of the page Wikidata-only and therefore
 * rank-less, and two consecutive searches for the same word legitimately
 * disagree. Most of a typical page, not a rare edge case.
 *
 * Case-insensitive because the vocabulary around it is WoRMS's to recapitalise,
 * not ours to depend on.
 */
export function speciesRankLabel(rank: string): string | undefined {
  const trimmed = rank?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return undefined;
  return trimmed;
}

/**
 * The scientific name, with the rank named when the row is not a species.
 *
 * Sightings are deliberately not restricted to species rank - "a moray eel" is
 * an honest log entry and resolves to the family *Muraenidae* - so a row has to
 * say when it is broader than it looks. A binomial is self-evidently a species
 * and gets no suffix; "Muraenidae" alone would read as one, so it becomes
 * "Muraenidae (Family)".
 */
export function speciesNameWithRank(species: RankedSpecies): string {
  const rank = speciesRankLabel(species.rank);
  if (!rank || rank.toLowerCase() === "species") return species.scientific_name;
  return `${species.scientific_name} (${rank})`;
}
