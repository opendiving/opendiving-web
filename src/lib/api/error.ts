// Shape of a single FastAPI/Pydantic validation error entry, as returned in
// `detail` for 422 responses, e.g.:
// `{"detail": [{"type": "missing", "loc": ["body", "name"], "msg": "Field required", "input": null}]}`
interface ValidationErrorDetail {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
}

/**
 * The HTTP status of an error thrown by the API client (axios), or `undefined`
 * when the request never got an answer - or when the error did not come from
 * a request at all.
 */
export function getApiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/**
 * Extracts a human-readable error message from an error thrown by the API
 * client (axios). FastAPI's `detail` field is a plain string for most
 * errors, but an array of validation error objects for 422 responses.
 * Rendering that array directly (e.g. as a toast description) crashes React,
 * since plain objects aren't valid React children - this normalizes both
 * shapes into a single displayable string.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = (detail as ValidationErrorDetail[])
      .map((item) => {
        if (typeof item === "string") return item;
        const field = Array.isArray(item?.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : null;
        return field && item?.msg ? `${field}: ${item.msg}` : item?.msg;
      })
      .filter((msg): msg is string => Boolean(msg));

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return fallback;
}

/**
 * The API's message for one body field of a 422, or `null` when the error says
 * nothing about that field.
 *
 * For a form that shows a refusal beside the input it is about rather than in
 * the dialog's one error line - the person dialog's `username`, which the API
 * refuses as a field-level validation error. Everything else still goes through
 * `getApiErrorMessage`.
 */
export function getApiFieldError(error: unknown, field: string): string | null {
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  if (!Array.isArray(detail)) return null;

  const match = (detail as ValidationErrorDetail[]).find(
    (item) =>
      Array.isArray(item?.loc) &&
      item.loc.length === 2 &&
      item.loc[0] === "body" &&
      item.loc[1] === field,
  );
  return match?.msg || null;
}

/**
 * The API's sentence when a save is refused because the name is already one of the
 * caller's - a trip, a contact, a gear set, a dive site at that locality - or `null`.
 *
 * The API matches names trimmed and case-folded, and answers a match with a flat 422
 * (`{"detail": "A trip with this name already exists"}`) rather than a field error,
 * so the sentence is the only thing marking it. For the dialogs that show it on the
 * name field; one this misreads still reaches the diver through `getApiErrorMessage`.
 */
export function getApiDuplicateError(error: unknown): string | null {
  if (getApiErrorStatus(error) !== 422) return null;
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  return typeof detail === "string" && /\balready (exists|has)\b/.test(detail)
    ? detail
    : null;
}
