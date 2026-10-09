// How long after a press lifts its click can still arrive.
const CLICK_AFTER_LIFT_MS = 400;

/**
 * Swallows the click the press `down` is about to produce, wherever it lands, so
 * the press does the one thing it was taken for - closing a menu, showing a hint -
 * and not also whatever its click would reach. A press the browser turns into a
 * scroll sends no click, and the swallow lapses with it.
 */
export function swallowClickOf(down: Pick<PointerEvent, "pointerId">): void {
  const swallow = (click: MouseEvent) => {
    click.preventDefault();
    click.stopPropagation();
    stop();
  };
  const lift = (up: PointerEvent) => {
    if (up.pointerId === down.pointerId) {
      window.setTimeout(stop, CLICK_AFTER_LIFT_MS);
    }
  };
  const cancel = (up: PointerEvent) => {
    if (up.pointerId === down.pointerId) stop();
  };
  function stop() {
    document.removeEventListener("click", swallow, true);
    document.removeEventListener("pointerup", lift, true);
    document.removeEventListener("pointercancel", cancel, true);
  }
  document.addEventListener("click", swallow, true);
  document.addEventListener("pointerup", lift, true);
  document.addEventListener("pointercancel", cancel, true);
}
