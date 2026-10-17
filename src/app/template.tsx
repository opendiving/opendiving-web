// Unlike layout.tsx, Next.js remounts a template.tsx, so it's a good place to
// re-trigger a lightweight enter animation for the new page's content without
// affecting the persistent Header/Footer in AppShell.
//
// Not on every navigation, though. A template is keyed at its own segment
// level, and this one's level is the *first* path segment - so the fade runs
// on /dives -> /home, and does not run on /dives -> /dives/[id], on
// /dives/[id] -> /dives/[id]/edit, or on a step of the dive pager. Measured in
// a browser under both `next dev` and `next build`.
//
// Do not "fix" that by keying a wrapper on usePathname(). It would remount the
// whole subtree on a pager step, which is what `dives/(detail)/` exists to
// stop - the dive page would blank into its skeleton and the pager would drop
// keyboard focus on every dive. See "`dives/(detail)/layout.tsx` owns the dive
// fetch, so a step keeps the page mounted" in DECISIONS.md.
//
// A plain fade, and a short one. A page renders its own shape immediately (see
// `page-skeleton.tsx`), so the thing being animated is real content, and it
// only wants enough of a fade to mark that the route changed - travel on top
// of it reads as lag.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in duration-150 ease-out motion-reduce:animate-none">
      {children}
    </div>
  );
}
