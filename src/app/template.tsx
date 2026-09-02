// Unlike layout.tsx, Next.js remounts a template.tsx, so it's a good place to
// re-trigger a lightweight enter animation for the new page's content without
// affecting the persistent Header/Footer in AppShell.
//
// Not "on every navigation", which is what this said for a long time and is
// the thing to know before touching it. A template is keyed at its own segment
// level, and this one's level is the *first* path segment - so the fade runs
// on /dives -> /dashboard, and does not run on /dives -> /dives/[id], on
// /dives/[id] -> /dives/[id]/edit, or on a step of the dive pager. Measured in
// a browser under both `next dev` and `next build`.
//
// Do not "fix" that by keying a wrapper on usePathname(). It would remount the
// whole subtree on a pager step, which is exactly what `dives/(detail)/` was
// introduced to stop - the dive page would blank into its skeleton again and
// the pager would drop keyboard focus on every dive. See "The step remounted
// the page..." in DECISIONS.md.
//
// A plain fade, and a short one. It used to be `slide-in-from-bottom-1` over
// 300ms, which was written when every page opened on a centered spinner: it
// spent the whole animation moving a `Loader2` up the screen and then cut
// hard to the real content, with no transition on the one swap that mattered.
// Now that a page renders its own shape immediately (see `page-skeleton.tsx`),
// the thing being animated is real content, and it only wants enough of a fade
// to mark that the route changed - the travel on top of it read as lag.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in duration-150 ease-out motion-reduce:animate-none">
      {children}
    </div>
  );
}
