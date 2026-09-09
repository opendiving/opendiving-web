import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The rule: **a button whose whole content is an icon is wrapped in
// `IconTooltip`, and never names itself.** An icon button that carries its own
// `aria-label` is one a screen reader can use and a pointer user has to guess
// at - which is the state the whole app was in, and the state one new button
// added next to the others quietly returns it to.
//
// Structural rather than a hover test per button, because the failure this
// guards against is a *missing* control, and there is nothing to query for the
// button somebody forgot. It reads the source for the shape instead: an open
// tag that declares `aria-label` on children that render no words.
//
// "Renders no words" is the only judgement here, and it is deliberately narrow.
// Children count as visible text if they contain a bare text node, or an
// expression that is anything other than a choice between JSX elements - so
// `{isBusy ? <Loader2 /> : <Trash2 />}` is still an icon, and `{label}`,
// `{value || placeholder}` and `{"Save"}` are not. A button that overrides
// visible text with `aria-label` (`entry-unit-toggle`, `data-export-card`,
// `dive-form-fields-menu` all do, each for a reason `DECISIONS.md` records) is
// left alone; a button with nothing but an icon in it is not.
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") && !full.includes(".test.") ? [full] : [];
  });

// Index of the first `token` in `src` that sits outside brackets, quotes and
// template literals - i.e. one belonging to this expression rather than to a
// nested one.
const topLevelIndex = (src: string, token: string, from = 0): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0 && src.startsWith(token, i)) return i;
  }
  return -1;
};

const stripTags = (src: string) => src.replace(/<[^>]*>/g, "");

// Blanks out comments while keeping every offset, so the scanners below can
// track quotes without an apostrophe in prose ("WCAG's Label in Name") reading
// as the start of a string and swallowing the rest of the file. Both forms in
// this codebase sit on their own line, which is what makes the line-comment rule
// safe: a `//` inside a string literal is never the first thing on its line.
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "));

// Whether a branch of a conditional puts anything on screen once its JSX
// elements are taken out. `( )` and `(\n)` do not; `("Save")` and `(count)` do.
const branchRendersText = (src: string) =>
  /[A-Za-z0-9"'`]/.test(stripTags(src).replace(/[()\s]/g, ""));

const expressionRendersText = (expr: string): boolean => {
  const src = stripTags(expr);
  const question = topLevelIndex(src, "?");
  if (question >= 0) {
    const colon = topLevelIndex(src, ":", question + 1);
    if (colon >= 0) {
      return (
        branchRendersText(src.slice(question + 1, colon)) ||
        branchRendersText(src.slice(colon + 1))
      );
    }
  }
  const and = topLevelIndex(src, "&&");
  if (and >= 0) return branchRendersText(src.slice(and + 2));
  return branchRendersText(src);
};

const matchBrace = (src: string, start: number): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return src.length;
};

const childrenRenderText = (inner: string): boolean => {
  const withoutComments = blankComments(inner);

  for (let i = 0; i < withoutComments.length; i++) {
    if (withoutComments[i] !== "{") continue;
    const end = matchBrace(withoutComments, i);
    if (expressionRendersText(withoutComments.slice(i + 1, end))) return true;
    i = end;
  }

  // Anything left after tags and expressions are removed is a bare text node.
  const text = stripTags(withoutComments.replace(/\{[\s\S]*?\}/g, "")).trim();
  return text.length > 0;
};

// Every `<Button …>` / `<button …>` open tag in the file, with the element's
// children, as `{ line, attributes, children }`.
const buttonElements = (original: string) => {
  const src = blankComments(original);
  const found: { line: number; attributes: string; children: string }[] = [];
  const opens = /<(Button|button)\b/g;
  let open: RegExpExecArray | null;

  while ((open = opens.exec(src))) {
    const tag = open[1];
    let depth = 0;
    let quote: string | null = null;
    let i = open.index + open[0].length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const attributes = src.slice(open.index, i + 1);
    let children = "";
    if (!attributes.endsWith("/>")) {
      const pairs = new RegExp(`<${tag}\\b|</${tag}>`, "g");
      pairs.lastIndex = i + 1;
      let level = 1;
      let pair: RegExpExecArray | null;
      while ((pair = pairs.exec(src))) {
        if (!pair[0].startsWith("</")) {
          level++;
          continue;
        }
        if (--level === 0) {
          children = src.slice(i + 1, pair.index);
          break;
        }
      }
    }
    found.push({
      line: src.slice(0, open.index).split("\n").length,
      attributes,
      children,
    });
  }

  return found;
};

describe("icon buttons", () => {
  it("carry no accessible name that the hover hint does not also show", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      buttonElements(readFileSync(file, "utf8"))
        .filter(
          ({ attributes, children }) =>
            /\saria-label[=\s]/.test(attributes) &&
            !childrenRenderText(children),
        )
        .map(({ line }) => `${path.relative(SRC, file)}:${line}`),
    );

    // Wrap it in `IconTooltip` and pass the name as `label` instead.
    expect(offenders.join("\n")).toEqual("");
  });
});
