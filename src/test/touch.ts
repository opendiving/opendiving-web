// A finger on a chart, as pointer events. For the browser project, where
// `PointerEvent` exists and carries `pointerType`; jsdom has neither.

import { fireEvent } from "@testing-library/react";

const FINGER = { pointerType: "touch", isPrimary: true, pointerId: 7 };

/** Where an element's centre is, in client coordinates. */
export function centreOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** A finger going down at a point on `target`. */
export function fingerDown(target: Element, at: { x: number; y: number }) {
  fireEvent.pointerDown(target, { ...FINGER, clientX: at.x, clientY: at.y });
}

/** A finger already down on `target`, moved to a point. */
export function fingerMove(target: Element, at: { x: number; y: number }) {
  fireEvent.pointerMove(target, { ...FINGER, clientX: at.x, clientY: at.y });
}

/** The finger lifting at a point - pointer capture keeps it on `target`. */
export function fingerUp(target: Element, at: { x: number; y: number }) {
  fireEvent.pointerUp(target, { ...FINGER, clientX: at.x, clientY: at.y });
}

/** A tap: down and up at one point, without moving. */
export function tap(target: Element, at: { x: number; y: number }) {
  fingerDown(target, at);
  fingerUp(target, at);
}

/** A finger pressing somewhere else on the page. */
export function pressElsewhere() {
  fireEvent.pointerDown(document.body, { ...FINGER, pointerId: 8 });
}
