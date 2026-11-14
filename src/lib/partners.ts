/**
 * An app the project partners with, linked from More and from the landing page
 * on the project's own instance only (`project_operated`).
 */
export interface PartnerApp {
  name: string;
  href: string;
  description: string;
  /** Served from `public/partners/`: `img-src` names no third party. */
  logo: string;
}

/** In the order both places list them. */
export const PARTNER_APPS: readonly PartnerApp[] = [
  {
    name: "DiveCalc",
    href: "https://www.divecalc.app/",
    description: "Scuba calculators and guides for gas planning and Nitrox",
    logo: "/partners/divecalc.svg",
  },
  {
    // Lowercase is the app's own spelling.
    name: "marola",
    href: "https://marola.dev/",
    description: "Sea conditions at every beach, today and tomorrow",
    logo: "/partners/marola.png",
  },
];

// `noopener` without `noreferrer`, unlike the app's other external links: a
// partner sees the visit came from OpenDiving, and the site-wide
// `strict-origin-when-cross-origin` keeps that to the origin alone.
export const PARTNER_LINK_REL = "noopener";
