/**
 * The API's OpenAPI document cut down to what one credential can call.
 *
 * Every operation carries `x-opendiving-credentials`, the credentials the API accepts on it,
 * derived there from the dependencies that enforce them. The document's own `security` cannot
 * say this: an access token and an API key share one bearer scheme.
 */

export const CREDENTIALS_EXTENSION = "x-opendiving-credentials";

export const CREDENTIAL_OPTIONS = [
  { value: "session", label: "Signed-in session" },
  { value: "superuser", label: "Superuser session" },
  { value: "api-key-scoped", label: "API key: custom permissions" },
  { value: "api-key-read", label: "API key: legacy read" },
  { value: "api-key-write", label: "API key: legacy read & write" },
  { value: "anonymous", label: "No credential" },
] as const;

export type Credential = (typeof CREDENTIAL_OPTIONS)[number]["value"];

type OpenApiDocument = Record<string, unknown>;
type Operation = Record<string, unknown>;

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function operationsOf(document: OpenApiDocument): Operation[] {
  const paths = (document.paths ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  return Object.values(paths).flatMap((item) =>
    Object.entries(item)
      .filter(([key]) => HTTP_METHODS.has(key))
      .map(([, operation]) => operation as Operation),
  );
}

/**
 * Whether the document names each operation's credentials. A build of the API from before the
 * extension does not, and the filter has nothing to filter on there.
 */
export function namesCredentials(document: OpenApiDocument): boolean {
  return operationsOf(document).some((operation) =>
    Array.isArray(operation[CREDENTIALS_EXTENSION]),
  );
}

/**
 * The document with only the operations `credential` may call. A path left with none is dropped,
 * and so is a top-level tag no remaining operation uses, so the sidebar has no empty groups.
 */
export function filterByCredential(
  document: OpenApiDocument,
  credential: Credential,
): OpenApiDocument {
  const paths = (document.paths ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const kept: Record<string, Record<string, unknown>> = {};

  for (const [path, item] of Object.entries(paths)) {
    const filtered = Object.fromEntries(
      Object.entries(item).filter(([key, operation]) => {
        if (!HTTP_METHODS.has(key)) return true;
        const accepted = (operation as Operation)[CREDENTIALS_EXTENSION];
        return Array.isArray(accepted) && accepted.includes(credential);
      }),
    );
    if (Object.keys(filtered).some((key) => HTTP_METHODS.has(key))) {
      kept[path] = filtered;
    }
  }

  const result: OpenApiDocument = { ...document, paths: kept };
  if (Array.isArray(document.tags)) {
    const used = new Set(
      operationsOf(result).flatMap((operation) =>
        Array.isArray(operation.tags) ? (operation.tags as string[]) : [],
      ),
    );
    result.tags = (document.tags as { name: string }[]).filter((tag) =>
      used.has(tag.name),
    );
  }
  return result;
}
