// Carries `instant = false` for the page below: see "A page under an auth-gate layout
// opts out of instant validation" in DECISIONS.md.
export const instant = false;

export default function CheckInSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
