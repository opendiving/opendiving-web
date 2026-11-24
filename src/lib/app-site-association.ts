// The links the iOS app opens, as Apple's `components` patterns. In those `?` is exactly
// one character and `*` any number, so a record page is matched by the shape of a uuid:
// nothing beside it (`/dives/new`) or beneath it (`/dives/<id>/edit`) has that shape.

// Every directory with a record page the iOS app has a screen for. A list page and every
// other page beside or beneath one stay in the browser.
const RECORD_DIRECTORIES = [
  "sites",
  "dives",
  "trips",
  "people",
  "gear",
  "courses",
  "species",
  "import",
] as const;

const UUID = "????????-????-????-????-????????????";

interface Component {
  "/": string;
  "?"?: Record<string, string>;
}

// Next answers a trailing slash with a redirect to the page without it, and the app
// reads both as the same link, so each pattern is listed with and without one.
function withTrailingSlash(component: Component): Component[] {
  return [component, { ...component, "/": `${component["/"]}/` }];
}

const COMPONENTS: Component[] = [
  // `?*` is at least one character; the token's own alphabet is the app's to check.
  { "/": "/connect/?*" },
  // A sign-in link. An absent query item reads as empty, so `?*` asks for a token that is there.
  ...withTrailingSlash({
    "/": "/auth/verify",
    "?": { token: "?*" },
  }),
  ...RECORD_DIRECTORIES.flatMap((directory) =>
    withTrailingSlash({ "/": `/${directory}/${UUID}` }),
  ),
];

/** `/.well-known/apple-app-site-association` for the app named by `appId`. */
export function appSiteAssociation(appId: string) {
  return {
    applinks: {
      details: [{ appIDs: [appId], components: COMPONENTS }],
    },
  };
}
