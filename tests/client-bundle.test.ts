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

/** Every file a "use client" module drags into the browser bundle. */
function clientGraph(): Set<string> {
  const seen = new Set<string>();
  const queue = walk(SRC).filter((file) => /^["']use client["']/.test(fs.readFileSync(file, "utf8")));
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
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
