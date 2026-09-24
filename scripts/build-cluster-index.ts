/**
 * Build the cluster jewel index from Path of Building.
 *
 *   npm run clusters:index
 *   npm run clusters:index -- --from "C:\path\to\ClusterJewels.lua"
 *
 * A character imported from Path of Building carries its cluster jewels as item
 * text and its allocation as node ids that Path of Building invents — ids that
 * exist in no game data at all. Drawing those clusters means laying them out
 * exactly as Path of Building does, and that needs its tables: which slots of a
 * cluster hold sockets, notables and small passives for each size, the order
 * notables are placed in, which rotation each proxy group applies, and what each
 * small-passive enchant is called.
 *
 * All of it is in one generated file in Path of Building's repository,
 * `src/Data/ClusterJewels.lua`, which it marks as Grinding Gear Games' jewel
 * data. This reads that file — from GitHub by default, so it runs anywhere, or
 * from a local install with `--from` — and writes the same tables as JSON.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/Data/ClusterJewels.lua";
const OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "cluster-jewels.json");

type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue };

/**
 * Parse a Lua table literal of the kind Path of Building generates: `return`
 * followed by nested tables of strings, numbers and booleans, with keys written
 * as `name =`, `["name"] =` or `[0] =`, and `--` comments. Not a Lua parser, and
 * it refuses anything outside that shape rather than guessing at it.
 *
 * A table with only positional entries becomes an array. One with any explicit
 * key becomes an object, positional entries numbered from 1 as Lua numbers them.
 */
function parseLuaTable(source: string): LuaValue {
  let at = 0;
  const fail = (what: string): never => {
    const line = source.slice(0, at).split("\n").length;
    throw new Error(`Lua table: ${what} at line ${line}`);
  };
  const skip = () => {
    for (;;) {
      while (at < source.length && /\s/.test(source[at])) at += 1;
      if (source.startsWith("--", at)) {
        const end = source.indexOf("\n", at);
        at = end === -1 ? source.length : end + 1;
        continue;
      }
      return;
    }
  };
  const string = (): string => {
    const quote = source[at];
    at += 1;
    let out = "";
    while (at < source.length && source[at] !== quote) {
      if (source[at] === "\\") {
        const next = source[at + 1];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
        at += 2;
      } else {
        out += source[at];
        at += 1;
      }
    }
    if (source[at] !== quote) fail("unterminated string");
    at += 1;
    return out;
  };
  const value = (): LuaValue => {
    skip();
    const char = source[at];
    if (char === "{") return table();
    if (char === '"' || char === "'") return string();
    const number = /^-?\d+(\.\d+)?/.exec(source.slice(at, at + 32));
    if (number) {
      at += number[0].length;
      return Number(number[0]);
    }
    const word = /^[A-Za-z_]\w*/.exec(source.slice(at, at + 64));
    if (word) {
      at += word[0].length;
      if (word[0] === "true") return true;
      if (word[0] === "false") return false;
      if (word[0] === "nil") return null;
    }
    return fail(`unexpected "${char}"`);
  };
  const table = (): LuaValue => {
    at += 1; // {
    const keyed: Record<string, LuaValue> = {};
    const positional: LuaValue[] = [];
    let explicit = false;
    for (;;) {
      skip();
      if (source[at] === "}") {
        at += 1;
        break;
      }
      let key: string | null = null;
      if (source[at] === "[") {
        at += 1;
        skip();
        const inner = value();
        skip();
        if (source[at] !== "]") fail("expected ]");
        at += 1;
        key = String(inner);
      } else {
        const name = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(source.slice(at, at + 128));
        if (name) {
          key = name[1];
          at += name[1].length;
        }
      }
      if (key !== null) {
        skip();
        if (source[at] !== "=") fail("expected =");
        at += 1;
        keyed[key] = value();
        explicit = true;
      } else {
        positional.push(value());
      }
      skip();
      if (source[at] === "," || source[at] === ";") at += 1;
    }
    if (!explicit) return positional;
    positional.forEach((entry, index) => {
      keyed[String(index + 1)] = entry;
    });
    return keyed;
  };

  skip();
  if (source.startsWith("return", at)) at += "return".length;
  const result = value();
  skip();
  if (at < source.length) fail("trailing content");
  return result;
}

async function main() {
  const fromIndex = process.argv.indexOf("--from");
  let text: string;
  if (fromIndex !== -1 && process.argv[fromIndex + 1]) {
    text = fs.readFileSync(process.argv[fromIndex + 1], "utf8");
    process.stdout.write(`reading ${process.argv[fromIndex + 1]}\n`);
  } else {
    process.stdout.write(`fetching ${SOURCE}\n`);
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`Path of Building's repository returned HTTP ${response.status}`);
    text = await response.text();
  }

  const data = parseLuaTable(text) as Record<string, unknown>;
  for (const key of ["jewels", "notableSortOrder", "keystones", "orbitOffsets"]) {
    if (!(key in data)) throw new Error(`ClusterJewels.lua has no "${key}" table — has its format changed?`);
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(data)}\n`);
  const jewels = data.jewels as Record<string, { skills: Record<string, unknown> }>;
  const skills = Object.values(jewels).reduce((sum, jewel) => sum + Object.keys(jewel.skills).length, 0);
  process.stdout.write(
    `wrote ${Object.keys(jewels).length} sizes, ${skills} small-passive skills, ` +
      `${Object.keys(data.notableSortOrder as object).length} notables, ` +
      `${Object.keys(data.orbitOffsets as object).length} proxy offsets to ${OUTPUT} ` +
      `(${(fs.statSync(OUTPUT).size / 1024).toFixed(0)} KB)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
