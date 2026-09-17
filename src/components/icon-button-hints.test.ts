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

// Blanks out every JSX element tag while keeping offsets, so what remains is the
// text and expressions a button actually renders. A regex cannot do this: an
// attribute is allowed both braces and a `>` of its own (`className={cn(...)}`,
// `onClick={() => reset()}`), so the end of a tag has to be walked for. Getting
// this wrong is not a loud failure - a brace read out of `className={cn(...)}`
// looks like a children expression, the button is credited with visible text,
// and it is quietly exempted from the rule this file exists to enforce.
const blankTags = (src: string) => {
  const out = src.split("");
  for (let i = 0; i < src.length; i++) {
    // `<` is a tag only before a name, a closing slash or a fragment's `>`;
    // `{count < 3 && …}` is a comparison and has to stay legible.
    if (src[i] !== "<" || !/[A-Za-z/>]/.test(src[i + 1] ?? "")) continue;
    let depth = 0;
    let quote: string | null = null;
    let end = i + 1;
    for (; end < src.length; end++) {
      const c = src[end];
      if (quote) {
        if (c === quote && src[end - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    for (let k = i; k <= Math.min(end, src.length - 1); k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
    i = end;
  }
  return out.join("");
};

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
  /[A-Za-z0-9"'`]/.test(blankTags(src).replace(/[()\s]/g, ""));

const expressionRendersText = (expr: string): boolean => {
  const src = blankTags(expr);
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
  // Tags go first, so the only braces left are ones opening a children
  // expression rather than an attribute's.
  const src = blankTags(blankComments(inner));
  let outsideExpressions = "";

  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "{") {
      outsideExpressions += src[i];
      continue;
    }
    const end = matchBrace(src, i);
    if (expressionRendersText(src.slice(i + 1, end))) return true;
    i = end;
  }

  // Anything left is a bare text node.
  return outsideExpressions.trim().length > 0;
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

// The rule above is only as good as this one judgement, and it is judgement made
// by a hand-rolled scanner rather than a parser - so the cases it has to get
// right are pinned here rather than left to whichever call sites happen to exist.
describe("the visible-text rule", () => {
  const icon = (children: string) => childrenRenderText(children);

  it("reads a lone icon as wordless", () => {
    expect(icon('<Trash2 className="h-4 w-4" />')).toBe(false);
  });

  it("is not fooled by braces in the icon's own attributes", () => {
    // The scanner used to find this `{` before tags were taken out, hand
    // `cn("h-4 w-4", danger && "text-destructive")` to the expression rule, and
    // credit the button with words it does not render.
    expect(
      icon(
        '<Trash2 className={cn("h-4 w-4", danger && "text-destructive")} />',
      ),
    ).toBe(false);
    expect(icon("<KeyRound size={16} />")).toBe(false);
  });

  it("reads a choice between icons as wordless", () => {
    expect(
      icon(`{isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}`),
    ).toBe(false);
  });

  it("reads a rendered value as words", () => {
    expect(icon('<CalendarIcon className="mr-2 h-4 w-4" />{label}')).toBe(true);
    expect(icon("{value || placeholder}")).toBe(true);
    expect(icon('<Plus className="h-4 w-4 mr-2" />\n Add schedule')).toBe(true);
  });

  it("reads a choice between words as words", () => {
    expect(icon('{item.is_archived ? "Unarchive" : "Archive"}')).toBe(true);
    expect(icon("{count > 0 && <span>{count}</span>}")).toBe(true);
  });

  it("ignores comments, apostrophes and all", () => {
    expect(
      icon(`{/* Named per row: ten "Edit"s tell a screen reader's controls
              list nothing about which row. */}
        <Edit className="h-4 w-4" />`),
    ).toBe(false);
  });
});

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
