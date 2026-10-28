/**
 * The two `<style>` elements Scalar renders on `/developers`, as CSP hash sources.
 *
 * Neither can carry the nonce: Scalar renders its theme through Vue with no nonce
 * option, and `@scalar/use-toasts` appends vue-sonner's stylesheet when it is
 * imported. A hash allows that exact text and nothing else, so it widens
 * `style-src` by two known stylesheets rather than by a source anything could use.
 *
 * Each is fixed by the pinned Scalar version and by the configuration in
 * `components/developers/api-reference.tsx` - the default theme, `withDefaultFonts`
 * off, no `customCss`. `api-reference-csp.test.ts` recomputes both from
 * `node_modules`, so an upgrade that changes either fails there rather than in a
 * diver's console.
 */
export const API_REFERENCE_STYLE_HASHES = [
  // Scalar's theme, `@scalar/themes`' `getThemeStyles` with fonts off.
  "'sha256-T13Uev3xCax2N28XaoAE8DOzQZKvPp7ZQVAi1iRREjo='",
  // vue-sonner's toast stylesheet, from `@scalar/use-toasts`.
  "'sha256-l/2OpPg0d+2VLTLgwjf5mQo2CYwHDEqdj5TjbfEyVJI='",
];
