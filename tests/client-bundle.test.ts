import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Resolve an import specifier to a file on disk, or null for a package. */
function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Value imports only. `import type` is erased by the compiler and ships
 * nothing, so following it would flag files the browser never sees — which it
 * did, on the type-only ItemArt import in GearSlot.
 */
function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/^import\s+(?!type\s)([\s\S]*?)from\s+"([^"]+)"/gm)].map((match) => match[2]);
}

/**
 * Every file a "use client" module drags into the browser bundle.
 *
 * The walk stops at a "use server" module. A client component that imports a
 * server action gets a reference to it, not its code — Next never bundles that
 * module's imports for the browser — so following them reports files that are
 * not there. It did: `PlayerAdmin` imports `actions.ts`, whose imports reach the
 * whole parser, and a guard added for the cluster layout failed on that path
 * while the built client chunks held none of its code or data.
 */
function clientGraph(): Set<string> {
  const seen = new Set<string>();
  const queue = walk(SRC).filter((file) => /^["']use client["']/.test(fs.readFileSync(file, "utf8")));
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (/^["']use server["']/.test(fs.readFileSync(file, "utf8"))) continue;
    for (const specifier of importsOf(file)) {
      const resolved = resolve(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/**
 * The item art catalogue is 223 KB and exists to be read on the server. It
 * reached the browser once already: `buildTooltip` derives a shield's block and
 * an item's requirements from it, and the tooltip component sits inside a client
 * component, so the whole catalogue rode along in the bundle.
 */
test("the art catalogue never reaches the browser", () => {
  const offenders = [...clientGraph()].filter((file) => /item-art(-index)?\.(ts|json)$/.test(file));
  assert.deepEqual(
    offenders.map((file) => path.relative(process.cwd(), file)),
    [],
    "a client component imports the art catalogue",
  );
});

/** Same reasoning: the gem colour index is 58 KB of server-side lookup. */
test("the gem colour index never reaches the browser", () => {
  const offenders = [...clientGraph()].filter((file) => /gem-colors\.json$/.test(file));
  assert.deepEqual(offenders.map((file) => path.relative(process.cwd(), file)), []);
});

/**
 * The skill list is smaller than the two above — 5 KB against 223 and 58 — but
 * it is the same rule and there is no reason to spend it on every page that
 * mounts a form. `SkillSelect` takes the options as a prop; the pages read them
 * on the server, the way `ItemTooltip` takes finished sections.
 */
test("the skill name list never reaches the browser", () => {
  const offenders = [...clientGraph()].filter((file) => /skill-names\.json$/.test(file));
  assert.deepEqual(offenders.map((file) => path.relative(process.cwd(), file)), []);
});

/**
 * The gem art index is 102 KB and `gemArt` reads it to resolve the picture
 * beside a character's name. It is resolved in a server component and handed
 * over as a finished path, so the index itself must stay out of the bundle —
 * and `gems.ts` now also exports `skillNames`, which a form is the obvious
 * thing to want to import directly.
 */
test("the gem module never reaches the browser", () => {
  // Either separator: a pattern matching only "/" never fires on Windows paths,
  // and this one silently passed there until the cluster guard exposed it.
  const offenders = [...clientGraph()].filter((file) => /poe1[\\/]gems\.ts$/.test(file));
  assert.deepEqual(offenders.map((file) => path.relative(process.cwd(), file)), []);
});

/**
 * The cluster layout reads Path of Building's cluster tables and each tree
 * version's data — 28 KB and 52 KB — and runs on the server; the page hands the
 * client finished circles and lines. `PassiveTree` imports only the layout's
 * *type*, which ships nothing, and this keeps it that way.
 */
test("the cluster layout and its data never reach the browser", () => {
  const offenders = [...clientGraph()].filter((file) =>
    /poe1[\\/](clusters\.ts|cluster-jewels\.json|tree-data[\\/].*)$/.test(file),
  );
  assert.deepEqual(offenders.map((file) => path.relative(process.cwd(), file)), []);
});
