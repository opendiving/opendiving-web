import type { BaseSyntheticEvent, FormEventHandler } from "react";

// Wraps a dialog form's submit handler so its submit event can't reach a form
// higher up the React tree.
//
// Every "quick add" dialog (new gear item, new gear set, new dive site, new
// trip) is rendered *from inside the dive form* - the pickers that open them
// live in its fields. Radix portals `DialogContent` out to `document.body`, so
// there are no nested `<form>` elements in the DOM and it looks safe. But React
// bubbles events through the **React** tree, not the DOM tree, so the dialog's
// submit event still lands in the dive form's own `onSubmit`.
//
// The visible symptom: create a gear item from the dive form and the item saves
// fine, then the dive form behind the dialog runs its own `handleSubmit`,
// fails validation on whatever isn't filled in yet ("Duration is required") and
// scrolls to that field. `handleSubmit` calls `preventDefault()` but never
// `stopPropagation()`, so the outer handler runs regardless.
//
// Usage: `<form onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}>`.
export function dialogFormSubmit(
  handler: (event?: BaseSyntheticEvent) => unknown,
): FormEventHandler<HTMLFormElement> {
  return (event) => {
    event.stopPropagation();
    void handler(event);
  };
}
