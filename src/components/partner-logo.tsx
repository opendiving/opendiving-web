import type { PartnerApp } from "@/lib/partners";

interface PartnerLogoProps {
  partner: PartnerApp;
  className?: string;
}

// Decorative: the partner's name always sits beside it. A plain `<img>`, as
// everywhere in the app: nothing uses `next/image` (see `next.config.js`).
export function PartnerLogo({ partner, className }: PartnerLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={partner.logo}
      alt=""
      width={40}
      height={40}
      className={className}
    />
  );
}
