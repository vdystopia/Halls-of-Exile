import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { parseItem } from "../src/lib/items";
import { decodePobCode, isPobUrl, parsePob, PobError } from "../src/lib/pob";

const encode = (xml: string) =>
  zlib.deflateSync(Buffer.from(xml, "utf8")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

test("resolves {range:…} rolls the way Path of Building displays them", () => {
  const item = parseItem(
    `Rarity: UNIQUE
Circle of Guilt
Iron Ring
Item Level: 84
LevelReq: 12
Implicits: 1
{range:0.7}Adds (6-8) to (9-12) Physical Damage to Attacks
{range:0.8}+(20-30) to maximum Energy Shield`,
    1,
  );
  assert.equal(item.rarity, "UNIQUE");
  assert.equal(item.name, "Circle of Guilt");
  assert.equal(item.base, "Iron Ring");
  assert.deepEqual(item.implicits, ["Adds 7 to 11 Physical Damage to Attacks"]);
  assert.deepEqual(item.explicits, ["+28 to maximum Energy Shield"]);
});

test("keeps only the selected variant of a unique", () => {
  const item = parseItem(
    `Rarity: UNIQUE
Watcher's Eye
Prismatic Jewel
Selected Variant: 2
Implicits: 0
{variant:1}10% increased Damage while affected by Anger
{variant:2}+1% to Critical Strike Chance while affected by Precision
Always present line`,
    2,
  );
  assert.deepEqual(item.explicits, [
    "+1% to Critical Strike Chance while affected by Precision",
    "Always present line",
  ]);
});

test("reads sockets, links, crafted tags and corruption", () => {
  const item = parseItem(
    `Rarity: RARE
Corpse Halo
Eternal Burgonet
Item Level: 85
Quality: 20
Sockets: R-R-R B-G
LevelReq: 69
Implicits: 1
{crafted}+1 to Level of Socketed Aura Gems
+112 to maximum Life
Shaper Item
Corrupted`,
    3,
  );
  assert.deepEqual(item.sockets, [["R", "R", "R"], ["B", "G"]]);
  assert.equal(item.quality, 20);
  assert.equal(item.itemLevel, 85);
  assert.equal(item.levelReq, 69);
  assert.match(item.implicits[0], /crafted/);
  assert.deepEqual(item.influences, ["Shaper"]);
  assert.deepEqual(item.flags, ["Corrupted"]);
});

test("decodes a build code and pulls out the build, gems, gear and tree", () => {
  const xml = `<?xml version="1.0"?>
<PathOfBuilding>
  <Build level="94" targetVersion="3_0" className="Ranger" ascendClassName="Pathfinder" bandit="None" mainSocketGroup="2">
    <PlayerStat stat="Life" value="4820"/>
    <PlayerStat stat="FullDPS" value="5620000"/>
  </Build>
  <Skills activeSkillSet="1">
    <SkillSet id="1">
      <Skill enabled="true" slot="Helmet"><Gem nameSpec="Grace" skillId="Grace" level="21" quality="0" enabled="true"/></Skill>
      <Skill enabled="true" slot="Body Armour">
        <Gem nameSpec="Toxic Rain" skillId="ToxicRain" level="21" quality="20" enabled="true"/>
        <Gem nameSpec="Void Manipulation Support" skillId="SupportVoidManipulation" level="20" quality="20" enabled="true"/>
      </Skill>
    </SkillSet>
  </Skills>
  <Tree activeSpec="1">
    <Spec title="Default" treeVersion="3_23" nodes="1,2,3,4" masteryEffects="{1,2},{3,4}">
      <URL>https://www.pathofexile.com/passive-skill-tree/AAA</URL>
    </Spec>
  </Tree>
  <Items activeItemSet="1">
    <Item id="1">
Rarity: RARE
Death Barb
Spine Bow
Sockets: G-G-G
Implicits: 0
+2 to Level of Socketed Bow Gems
    </Item>
    <ItemSet id="1"><Slot name="Weapon 1" itemId="1"/></ItemSet>
  </Items>
  <Config><Input name="enemyIsBoss" string="Pinnacle"/><Input name="conditionStationary" boolean="false"/></Config>
</PathOfBuilding>`;

  const build = parsePob(encode(xml));
  assert.equal(build.className, "Ranger");
  assert.equal(build.ascendClassName, "Pathfinder");
  assert.equal(build.level, 94);
  assert.equal(build.bandit, undefined, "bandit None is not recorded");
  assert.equal(build.mainSkill, "Toxic Rain", "main socket group picks the active gem");
  assert.equal(build.stats.Life, 4820);
  assert.equal(build.skillGroups.length, 2);
  assert.equal(build.skillGroups[1].isMain, true);
  assert.equal(build.skillGroups[1].gems[1].support, true);
  assert.equal(build.items.length, 1);
  assert.equal(build.items[0].slot, "Weapon 1");
  assert.equal(build.trees[0].nodeCount, 4);
  assert.equal(build.trees[0].treeVersion, "3.23");
  assert.deepEqual(build.config, [{ name: "enemyIsBoss", value: "Pinnacle" }], "false config inputs are dropped");
});

test("rejects anything that is not a build code", () => {
  assert.throws(() => decodePobCode("definitely-not-a-build"), PobError);
  assert.throws(() => decodePobCode(""), PobError);
  assert.throws(() => parsePob(encode("<NotABuild/>")), PobError);
});

test("recognises the build hosts it can fetch from", () => {
  assert.equal(isPobUrl("https://pobb.in/1gHUqoK3ZVCG"), true);
  assert.equal(isPobUrl("https://pastebin.com/abc123"), true);
  assert.equal(isPobUrl("https://poe.ninja/pob/abc"), true);
  assert.equal(isPobUrl("https://example.com/build"), false);
});
