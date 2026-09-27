/**
 * Build the gem colour index and the active skill name list from RePoE.
 *
 *   npm run gems:index
 *
 * Two files, one download. They come from the same snapshot deliberately: a
 * skill offered in the form that the colour index has never heard of would be a
 * gem the archive can name but not draw.
 *
 * A gem's colour is its attribute — red is strength, green dexterity, blue
 * intelligence, white none — and Path of Building's export does not record it:
 * a Gem node carries only the gem's metadata id, name and level. RePoE's gem
 * dump carries `color` per gem, so this reduces a 34 MB file to a map from
 * metadata id and display name to a single letter.
 *
 * Transfigured gems ("Frostblink of Wintry Blast") export the base gem's
 * metadata id, so they resolve through it without needing their own entry.
 */
import fs from "node:fs";
import path from "node:path";
import renames from "../src/lib/games/poe1/gem-renames.json";

const SOURCE = "https://repoe-fork.github.io/gems.json";
const TAGS_SOURCE = "https://repoe-fork.github.io/gem_tags.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "gem-colors.json");
const SKILLS_OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "skill-names.json");
const TAGS_OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "gem-tags.json");

type Gem = {
  color?: string;
  display_name?: string;
  tags?: string[];
  base_item?: { id?: string; display_name?: string; release_state?: string } | null;
};

/** r, g, b and w are the four gem colours; anything else is a data error. */
const COLORS = new Set(["r", "g", "b", "w"]);

/**
 * Gems that exist in the data but not in the game: the developers' own test
 * skills, and the "[DNT]" rows the translators are told to leave alone. They
 * pass the released-state filter, so they are excluded by name.
 */
const INTERNAL = /^\[DNT\]|^Playtest /;

async function main() {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`RePoE returned HTTP ${response.status}`);
  const data = (await response.json()) as Record<string, Gem>;

  /**
   * A gem's tags — the "Spell, AoE, Fire" line under its name — come as ids
   * (`area`, `random_element`) and the game shows them by another table: `area`
   * is "AoE", `random_element` is "Prismatic". A tag with no display name there
   * is one the game never shows (the attribute tags, `grants_active_skill`,
   * `low_max_level`), so it is left out rather than printed raw.
   */
  process.stdout.write(`fetching ${TAGS_SOURCE}\n`);
  const tagsResponse = await fetch(TAGS_SOURCE);
  if (!tagsResponse.ok) throw new Error(`RePoE returned HTTP ${tagsResponse.status} for gem tags`);
  const tagNames = (await tagsResponse.json()) as Record<string, string | null>;

  const colors: Record<string, string> = {};
  // Each active skill's shown tags, in the game's own order, by the gem's name.
  const tags: Record<string, string[]> = {};
  // Active skills only. The form this feeds asks "what was the character built
  // around", and no character was built around Increased Area of Effect. RePoE
  // has no is_support field, but the metadata id carries the answer outright —
  // SkillGem versus SupportGem — and splits every gem cleanly, with nothing
  // falling outside the two.
  const skills = new Set<string>();
  for (const gem of Object.values(data)) {
    const color = gem.color;
    if (!color || !COLORS.has(color)) continue;
    if (gem.base_item?.release_state === "unreleased") continue;
    // A support's name is "Arcane Surge Support" here and "Arcane Surge" in an
    // export, so both spellings are indexed.
    const names = [gem.base_item?.display_name, gem.display_name].filter(Boolean) as string[];
    const keys = [gem.base_item?.id, ...names, ...names.map((name) => name.replace(/ Support$/, ""))];
    for (const key of keys) {
      if (key && !colors[key]) colors[key] = color;
    }

    const id = gem.base_item?.id;
    const name = gem.base_item?.display_name ?? gem.display_name;
    if (id?.startsWith("Metadata/Items/Gems/SkillGem") && name && !INTERNAL.test(name)) {
      skills.add(name);
      // A transfigured gem is its own row here, sharing the base gem's item and
      // carrying its own tags ("Ice Nova of Frostbolts" under Ice Nova's id), so
      // its tags are filed under its own name and never stand in for the base's.
      const own = gem.display_name ?? name;
      const shown = (gem.tags ?? []).map((tag) => tagNames[tag]).filter((tag): tag is string => Boolean(tag));
      if (shown.length && !tags[own]) tags[own] = shown;
    }
  }

  /**
   * A gem the game renamed keeps its old name here too: the archive spans every
   * version, and a character from before the rename carries the old one. The
   * data only knows the current name, so `gem-renames.json` maps old to new by
   * hand; add a pair when a refresh reports a name gone.
   */
  for (const [former, current] of Object.entries(renames as Record<string, string>)) {
    for (const suffix of ["", " Support"]) {
      const value = colors[current + suffix] ?? colors[current];
      if (value && !colors[former + suffix]) colors[former + suffix] = value;
    }
    if (tags[current] && !tags[former]) tags[former] = tags[current];
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(colors).sort()) sorted[key] = colors[key];

  fs.writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 0)}\n`);
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(`wrote ${Object.keys(sorted).length} gem keys to ${OUTPUT} (${size} KB)\n`);

  const names = [...skills].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(SKILLS_OUTPUT, `${JSON.stringify(names, null, 0)}\n`);
  const skillSize = (fs.statSync(SKILLS_OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(`wrote ${names.length} active skills to ${SKILLS_OUTPUT} (${skillSize} KB)\n`);

  const sortedTags = Object.fromEntries(Object.keys(tags).sort().map((key) => [key, tags[key]]));
  fs.writeFileSync(TAGS_OUTPUT, `${JSON.stringify(sortedTags, null, 0)}\n`);
  const tagSize = (fs.statSync(TAGS_OUTPUT).size / 1024).toFixed(0);
  const untagged = names.filter((name) => !tags[name]);
  process.stdout.write(
    `wrote tags for ${Object.keys(sortedTags).length} skills (transfigured ones included) to ${TAGS_OUTPUT} (${tagSize} KB)\n`,
  );
  if (untagged.length) process.stdout.write(`${untagged.length} skills show no tags: ${untagged.join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
