// Unlike layout.tsx, Next.js remounts template.tsx on every navigation, so
// it's a good place to re-trigger a lightweight enter animation for the new
// page's content without affecting the persistent Header/Footer in AppShell.
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
