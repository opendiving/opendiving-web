// Unlike layout.tsx, Next.js remounts template.tsx on every navigation, so
// it's a good place to re-trigger a lightweight enter animation for the new
// page's content without affecting the persistent Header/Footer in AppShell.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      {children}
    </div>
  );
}
