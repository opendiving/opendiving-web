// Layout checks for the hand-rolled SVG charts, for the browser lane only. jsdom
// lays nothing out, so both come back empty there whatever the markup is.

// Every pair of `<text>` elements in `svg` whose rendered boxes intersect,
// named by what they say.
export function overlappingLabels(svg: SVGSVGElement): string[] {
  const labels = [...svg.querySelectorAll("text")].map((text) => ({
    text: text.textContent ?? "",
    box: text.getBoundingClientRect(),
  }));

  return labels.flatMap((a, index) =>
    labels
      .slice(index + 1)
      .filter(
        (b) =>
          a.box.left < b.box.right &&
          b.box.left < a.box.right &&
          a.box.top < b.box.bottom &&
          b.box.top < a.box.bottom,
      )
      .map((b) => `${a.text} / ${b.text}`),
  );
}

// Every element from `element`'s parent up to and including `root` that is
// wider inside than out - that is, that scrolls sideways.
export function sidewaysScrollers(element: Element, root: Element): string[] {
  const found: string[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth) {
      found.push(`${node.className} ${node.scrollWidth} > ${node.clientWidth}`);
    }
    if (node === root) break;
  }
  return found;
}

// Whether `inner`'s box lies within `outer`'s left and right edges, to within
// half a pixel of rounding.
export function withinSides(inner: Element, outer: Element): boolean {
  const a = inner.getBoundingClientRect();
  const b = outer.getBoundingClientRect();
  return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
}
