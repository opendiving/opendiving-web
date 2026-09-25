import { z } from "zod";

// The API's `NOTES_MAX_LENGTH` (`core/schemas.py`), one figure for every record
// that carries notes. Set past any note a person writes because an imported one
// may be longer than a form would ever take - the format leaves notes unbounded -
// and a cap below it would make that record uneditable here.
export const NOTES_MAX_LENGTH = 100_000;

/** A record's free-text notes, bounded where the API bounds them. */
export const notesField = () =>
  z
    .string()
    .max(
      NOTES_MAX_LENGTH,
      `Notes cannot exceed ${NOTES_MAX_LENGTH.toLocaleString("en-US")} characters`,
    );
