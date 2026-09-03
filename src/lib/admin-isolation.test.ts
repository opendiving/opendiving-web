import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The rule: **nothing outside the admin directories imports anything inside
// them.** It is what makes "the admin is a section of the diver's app" cost the
// diver nothing - the App Router splits a route's subtree into its own chunk,
// and one import from a shared module is all it takes to pull the whole admin
// back into everybody's bundle. The header's entry is a plain `Link` for exactly
// this reason.
//
// It is also the honest form of the guarantee. A bundle-size assertion would be
// a measurement of today's build; this is the property the guarantee rests on,
// and it fails on the import rather than on the megabytes it eventually costs.
//
// Deliberately structural rather than clever: specifiers are resolved to
// absolute paths, so `@/components/admin/x`, `../admin/x` and `./admin/x` are
// all one question - does this land inside a guarded directory - and none of
// them can be spelled around.
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

const GUARDED = ["app/admin", "components/admin"].map((dir) =>
  path.join(SRC, dir),
);

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return SOURCE_EXTENSIONS.includes(path.extname(full)) ? [full] : [];
  });
}

const isInside = (file: string, dir: string) =>
  file === dir || file.startsWith(`${dir}${path.sep}`);

// Every `from "..."`, `import("...")` and `require("...")` specifier in a file.
function specifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

// The absolute path a specifier points at, or null for a package import.
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(SRC, specifier.slice(2));
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

describe("the admin section is isolated", () => {
  it("guards directories that exist", () => {
    // Otherwise a rename turns this whole file into a test of nothing, silently.
    for (const dir of GUARDED) {
      expect(statSync(dir).isDirectory()).toBe(true);
    }
  });

  it("is imported by nothing outside itself", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !GUARDED.some((dir) => isInside(file, dir)))
      .flatMap((file) =>
        specifiers(readFileSync(file, "utf8"))
          .map((specifier) => resolveSpecifier(file, specifier))
          .filter(
            (target): target is string =>
              target !== null && GUARDED.some((dir) => isInside(target, dir)),
          )
          .map(
            (target) =>
              `${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`,
          ),
      );

    expect(offenders).toEqual([]);
  });

  it("finds an import when there is one to find", () => {
    // The negative control. Both halves of the check above can pass by doing
    // nothing - a regex that stopped matching, or a resolver that returned null
    // for everything - and an empty list looks identical either way.
    //
    // Assembled rather than written out, because this file is itself inside the
    // scan above: a literal guarded specifier here would be found and reported
    // as the very violation it is standing in for.
    const guarded = ["@", "components", "admin", "x"].join("/");
    const pretend = path.join(SRC, "components/layout/header.tsx");
    const target = resolveSpecifier(pretend, guarded);

    expect(specifiers(`import { X } from "${guarded}";`)).toEqual([guarded]);
    expect(target).not.toBeNull();
    expect(GUARDED.some((dir) => isInside(target as string, dir))).toBe(true);
  });
});
