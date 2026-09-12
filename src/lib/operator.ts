/**
 * Who the OpenDiving project is, as the operator of a copy it runs itself.
 *
 * The legal pages answer almost every question about a deployment with "whoever runs
 * this copy", because the software genuinely cannot know. On a copy the project
 * operates, it can: the project is that copy's operator, and these are the three facts
 * a reader is owed about the party standing in that role.
 *
 * Constants in code rather than an operator-settable variable, which is the same call
 * the landing hero's two voices made and for the same four reasons - see "The request
 * form speaks in two voices, and only `GET /config` can pick the second" in
 * `DECISIONS.md`. Nobody but the project would ever set them; prose in an environment
 * variable escapes this repo's review; and an identity assembled from separately
 * settable strings is several ways to name two parties at once.
 *
 * A name and an address, and deliberately no postal address. That is the operator's own
 * decision, taken knowing that it leaves a German Impressum incomplete.
 */
export const PROJECT_OPERATOR = {
  /** The natural person who operates the instances the project runs. */
  name: "Aleksei Vesnin",
  /**
   * Where a privacy request, a question about these pages, or the AGPLv3 section 13
   * source request goes. This is the *operator's* address; both pages still refuse to
   * print one for the project as the software's author, for the reason they give.
   */
  contactEmail: "contact@opendiving.app",
  /** The jurisdiction the operator operates from, and so the one the terms point at. */
  jurisdiction: "Germany",
} as const;

/**
 * Where the project's own source lives. The organisation rather than any one
 * repository: a running copy is two images built from two of them, and the legal pages
 * point at the source of the whole thing rather than at this app's half.
 */
export const PROJECT_SOURCE_URL = "https://github.com/opendiving";

/**
 * The endpoint that identifies the build an instance is running, for the AGPLv3 section
 * 13 offer. Same-origin: the web app proxies `/api/v1` through to the API.
 */
export const BUILD_IDENTITY_PATH = "/api/v1/health";
