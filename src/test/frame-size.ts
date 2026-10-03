// A size for every element's box, for a jsdom test of a map that fits itself
// to its frame.
//
// jsdom performs no layout - "jsdom answers no layout question" in DECISIONS.md
// - so a frame measures 0 by 0, and a map with no room asks for no tiles. A
// test that wants a map at all says how big its frame is, which is a statement
// about the scenario: a card this size. Where the tiles and pins then land is
// the browser lane's question.
//
// Returns the way back to jsdom's zeroes, which it defines on
// `Element.prototype`, beneath this.
export function giveFramesASize(size: {
  width: number;
  height: number;
}): () => void {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => size.width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => size.height,
  });
  return () => {
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  };
}
