// Native constraint validation cancels a submit *before* any React handler runs.
// `handleSubmit`'s valid callback never fires, its invalid callback never fires,
// and react-hook-form is not told anything happened - so a `<form>` that leaves
// the browser in charge has no way to say why it refused. What the diver sees is
// a Save button that does nothing, which is the same shape DECISIONS.md already
// records for a resolver rejection with nowhere to draw its message.
//
// The browser does try: it focuses the first refused control and shows a bubble
// over it. But the bubble is not in the DOM, vanishes on the next keystroke, and
// is shown *only* when the control can take focus - a control the page has
// scrolled away from or hidden gets no bubble at all and the submit is silently
// cancelled. None of it survives to be read, screen-reader announced or screenshot.
//
// So the form takes the decision back (`noValidate`), asks these helpers what the
// browser would have refused, and renders the answer where the diver is already
// looking. `reportValidity()` is still called afterwards, so the focus and the
// bubble are unchanged where they worked.

/** A form control that takes part in constraint validation. */
interface ConstrainedControl extends HTMLElement {
  readonly labels: NodeListOf<HTMLLabelElement> | null;
  readonly name: string;
  readonly validationMessage: string;
  readonly validity: ValidityState;
  readonly willValidate: boolean;
}

function isRefused(element: Element): element is ConstrainedControl {
  if (!("willValidate" in element)) return false;
  const control = element as ConstrainedControl;
  // `willValidate` is the barred-from-validation check - disabled, readonly and
  // the non-validating input types are all false here, and asking it rather than
  // enumerating those cases is what keeps this agreeing with the browser.
  return control.willValidate && !control.validity.valid;
}

/**
 * Every control on `form` that the browser's own constraint validation refuses,
 * in document order - which is the order the browser itself picks from when it
 * decides what to focus.
 *
 * Reads `validity.valid` rather than calling `checkValidity()`, because that one
 * fires an `invalid` event at each control as a side effect and this is a query.
 */
export function refusedControls(form: HTMLFormElement): ConstrainedControl[] {
  return Array.from(form.elements).filter(isRefused);
}

/** How a refused control should be named to the diver. */
function controlName(control: ConstrainedControl): string | null {
  // `labels` first: `FormControl` gives every field an id and `FormLabel` points
  // a `<label for>` at it, so this is the same words the diver is looking at.
  const labelled = control.labels?.[0]?.textContent?.trim();
  if (labelled) return labelled;

  const aria = control.getAttribute("aria-label")?.trim();
  if (aria) return aria;

  // `name` is a wire spelling rather than copy ("avg_depth"), but a field named
  // badly beats a field not named at all when the point is diagnosing it.
  return control.name || null;
}

/**
 * What to tell the diver when the browser would not submit `form`, or `null`
 * when it would.
 *
 * Names the first refused control and quotes the browser's own message for it.
 * That message is worth passing through rather than replacing: it is the only
 * part that says *what* about the value was wrong, and the wording differs by
 * engine, so nothing should be asserted against its exact text.
 */
export function describeBlockedSubmit(form: HTMLFormElement): string | null {
  const refused = refusedControls(form);
  if (refused.length === 0) return null;

  const [first, ...rest] = refused;
  const name = controlName(first);
  const reason = first.validationMessage || "This value is not valid.";
  const others =
    rest.length === 0
      ? ""
      : ` ${rest.length} other field${rest.length === 1 ? " was" : "s were"} also refused.`;

  return `Your browser would not submit this form. ${
    name === null ? reason : `${name}: ${reason}`
  }${others}`;
}
