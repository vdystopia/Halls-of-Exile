/**
 * Read a Lua table literal — the shape Path of Building writes its tree data in,
 * `return { ["key"]= value, … }` — into the JSON shape Grinding Gear Games'
 * `data.json` has, so one generator reads both.
 *
 * A table with no keys is a list, and `{}` is taken as one, which is what every
 * empty table in a tree file (`["in"]= {}`) stands for. Keys become strings, as
 * JSON's do: `[52349]= {…}` is node "52349".
 */
export function parseLuaTable(source: string): unknown {
  let at = source.indexOf("{");
  if (at < 0) throw new Error("no table in the Lua source");
  const fail = (what: string): never => {
    throw new Error(`Lua table: ${what} at offset ${at}`);
  };

  const skip = () => {
    for (;;) {
      while (at < source.length && /\s/.test(source[at])) at += 1;
      if (!source.startsWith("--", at)) return;
      const end = source.indexOf("\n", at);
      at = end < 0 ? source.length : end + 1;
    }
  };

  const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
  const string = (): string => {
    const quote = source[at];
    at += 1;
    let out = "";
    while (at < source.length && source[at] !== quote) {
      if (source[at] !== "\\") {
        out += source[at];
        at += 1;
        continue;
      }
      const next = source[at + 1];
      if (next in ESCAPES) {
        out += ESCAPES[next];
        at += 2;
      } else if (/\d/.test(next)) {
        const digits = /^\d{1,3}/.exec(source.slice(at + 1))![0];
        out += String.fromCharCode(Number(digits));
        at += 1 + digits.length;
      } else fail(`unknown escape \\${next}`);
    }
    if (source[at] !== quote) fail("unterminated string");
    at += 1;
    return out;
  };

  const value = (): unknown => {
    skip();
    const char = source[at];
    if (char === "{") return table();
    if (char === '"' || char === "'") return string();
    const word = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|nil)/.exec(source.slice(at, at + 64));
    if (!word) return fail(`unexpected "${char}"`);
    at += word[0].length;
    if (word[0] === "true") return true;
    if (word[0] === "false") return false;
    if (word[0] === "nil") return null;
    return Number(word[0]);
  };

  const table = (): unknown => {
    at += 1;
    const list: unknown[] = [];
    const keyed: Record<string, unknown> = {};
    let hasKeys = false;
    for (;;) {
      skip();
      if (at >= source.length) fail("unterminated table");
      if (source[at] === "}") {
        at += 1;
        break;
      }
      let key: string | null = null;
      if (source[at] === "[") {
        at += 1;
        const raw = value();
        skip();
        if (source[at] !== "]") fail('expected "]"');
        at += 1;
        skip();
        if (source[at] !== "=") fail('expected "="');
        at += 1;
        key = String(raw);
      } else {
        const name = /^[A-Za-z_]\w*\s*=(?!=)/.exec(source.slice(at, at + 128));
        if (name) {
          key = name[0].replace(/\s*=$/, "");
          at += name[0].length;
        }
      }
      const item = value();
      if (key === null) list.push(item);
      else {
        keyed[key] = item;
        hasKeys = true;
      }
      skip();
      if (source[at] === "," || source[at] === ";") at += 1;
    }
    if (!hasKeys) return list;
    list.forEach((item, index) => (keyed[String(index + 1)] = item));
    return keyed;
  };

  return value();
}
