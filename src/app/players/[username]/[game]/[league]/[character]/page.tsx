import Link from "next/link";
import { notFound } from "next/navigation";
import { AscendancyPortrait } from "@/components/AscendancyPortrait";
import { LeagueLogo } from "@/components/LeagueLogo";
import { CharacterAdmin } from "@/components/CharacterAdmin";
import { CopyButton } from "@/components/CopyButton";
import { GearGrid } from "@/components/GearGrid";
import { PassivePanel } from "@/components/PassivePanels";
import { PassiveTree } from "@/components/PassiveTree";
import { SkillGroups } from "@/components/SkillGroups";
import { SkillIcon } from "@/components/SkillIcon";
import { AllStatsTable, AttributeStrip, ResistanceBar, StatColumn } from "@/components/StatPanels";
import { classNameStyle } from "@/lib/games/class-colors";
import { classLine, formatPlayed, formatPlayedExact, leagueTitle, leagueWindow } from "@/lib/format";
import { leagueModifierLabel, leagueModifierTitle } from "@/lib/league-modifiers";
import { getCharacter, getLeague, getUser } from "@/lib/queries";
import { buildSkill, skillArt, skillNamesFor } from "@/lib/games/skills";
import { clusterLayout, drawnAllocation } from "@/lib/games/poe1/clusters";
import { chosenMasteries } from "@/lib/games/poe1/masteries";
import { TREE_DATA } from "@/lib/games/poe1/tree-data";
import { gearFor } from "@/lib/games/gear";
import { humanizeStatKey } from "@/lib/games/poe1/stats";

export const dynamic = "force-dynamic";

/** The header's picture height: the portrait at left and the league logo at right share it. */
const PORTRAIT_HEIGHT = 111;

type Props = { params: Promise<{ username: string; game: string; league: string; character: string }> };

export async function generateMetadata({ params }: Props) {
  const { username, game, league: leagueSlug, character: characterSlug } = await params;
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  const character = user && league ? getCharacter(user.id, league.id, characterSlug) : null;
  return { title: character ? `${character.name} · ${leagueSlug} · ${username}` : "Character" };
}

export default async function CharacterPage({ params }: Props) {
  const { username, game, league: leagueSlug, character: characterSlug } = await params;
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  if (!user || !league) notFound();
  const character = getCharacter(user.id, league.id, characterSlug);
  if (!character) notFound();

  const build = character.data;
  const stats = build.stats ?? {};
  const tree = build.trees?.[build.activeTree] ?? build.trees?.[0];
  const hasStats = Object.keys(stats).length > 0;
  const hasLeftColumn = hasStats || Boolean(build.passives);
  const played = formatPlayed(character.playedMinutes);
  // Resolved here, on the server, because the gem art index must not be shipped
  // to the browser. `buildSkill` only returns a gem this game's index can draw,
  // so the skill is shown with its picture or not at all — the rule the player
  // page's builds and banners follow too.
  const skillName = buildSkill(league.game, character.skillGem, character.mainSkill);
  const art = skillName ? skillArt(league.game, skillName) : null;
  const nameStyle = classNameStyle(league.game, character.className);
  // Which generated tree this build is drawn on, resolved here because the
  // index of what has been generated is server-side data.
  const treeNodes = tree?.nodes ?? [];
  const gear = gearFor(league.game);
  const treeArt = treeNodes.length ? gear.treeAsset(tree?.treeVersion) : null;
  // Clusters are laid out here, against the tree actually being drawn, and
  // handed to the client as finished geometry: the tree data they need stays on
  // the server, the rule the art and gem indexes follow.
  const treeData = treeArt ? TREE_DATA[treeArt.version] : undefined;
  const clusters = clusterLayout(tree, treeData);
  const litNodes = tree ? drawnAllocation(tree, clusters, treeData) : [];
  const masteries = chosenMasteries(tree, treeData);
  // Path of Building keeps a runegraft or tattoo on a node after the node is
  // refunded, and an override on a passive the character does not hold does
  // nothing — so only the allocated ones reach the tree, tooltip and colour alike.
  const lit = new Set(litNodes);
  const overrides = tree?.overrides
    ? Object.fromEntries(Object.entries(tree.overrides).filter(([id]) => lit.has(Number(id))))
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/players/${user.username}`} className="link-gold tracking-[0.18em] uppercase">
          {user.username}
        </Link>
        <span className="text-muted">/</span>
        <Link href={`/players/${user.username}/${league.game}/${league.slug}`} className="link-gold tracking-[0.18em] uppercase">
          {leagueTitle(league)}
        </Link>
      </div>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex flex-wrap items-start gap-4">
            {/* The class portrait, not the tree's emblem: see AscendancyPortrait.
                Height is set and the width follows each picture's own shape —
                240px for Path of Exile's 530x245 painting — so nothing is
                cropped and no character is stretched. */}
            <AscendancyPortrait game={league.game} ascendancy={character.ascendancy} height={PORTRAIT_HEIGHT} />
            {/* Name, level and class, the skill: nothing else. Prose from the
                record ("chaos dot") and build details belong elsewhere; only a
                named gem is shown here, and only with its picture. */}
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className={`display text-3xl ${nameStyle ? "gem-name" : ""}`} style={nameStyle}>
                  {character.name}
                </h1>
                {character.isFavorite ? <span className="text-lg text-gold">★</span> : null}
              </div>
              {/* The ascendancy alone — it already names the class. A character
                  without one is called by its class, and the absence is not
                  remarked on. */}
              <p className="mt-1 text-parchment/80">
                {`Level ${character.level ?? "Unknown"} · `}
                {classLine(character.className, character.ascendancy)}
              </p>
              {skillName ? (
                <div className="mt-3 flex items-center gap-2">
                  <SkillIcon src={art?.src} name={skillName} frames={art?.frames} size={28} />
                  <span className="tag border-rarity-gem/60 text-rarity-gem">{skillName}</span>
                </div>
              ) : null}
            </div>
          </div>
          {/* The league's logo closes the header on the right, at the
              portrait's height, so the two pictures bracket it top and bottom. */}
          <div className="flex flex-wrap items-start justify-end gap-6">
            <div className="flex flex-col items-end gap-2 text-right">
              <span className="tag">{leagueTitle(league)}</span>
              {/* Which variant of that league it was played in. One league is
                  several parallel leagues, and only the character knows which. */}
              {character.leagueModifiers.length ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {character.leagueModifiers.map((modifier) => (
                    <span key={modifier} className="tag" title={leagueModifierTitle(modifier)}>
                      {leagueModifierLabel(modifier)}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted">
                {leagueWindow(league.startDate, league.endDate, Boolean(league.endDateEstimated))}
              </p>
              {played ? <span className="tag">/played {played}</span> : null}
              <div className="flex flex-wrap justify-end gap-2">
                {character.pobUrl ? (
                  <a href={character.pobUrl} target="_blank" rel="noreferrer" className="btn px-3 py-1.5 text-xs">
                    Source ↗
                  </a>
                ) : null}
                {character.pobCode ? <CopyButton value={character.pobCode} /> : null}
              </div>
            </div>
            <LeagueLogo league={league} height={PORTRAIT_HEIGHT} />
          </div>
        </div>
      </header>

      {!hasStats && build.items.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          This character was written down by hand. Paste a Path of Building code under “Manage this character”,
          or{" "}
          <Link href={`/players/${user.username}/import`} className="link-gold">
            import the whole account
          </Link>{" "}
          from the game to fill in its gear, gems and tree.
        </div>
      ) : null}

      {/* The left column holds stats, or the passives an export names. A source
          with neither — Path of Exile 2's site, which serves no tree — leaves it
          out, and the gear takes its width rather than sitting beside a gap. */}
      <div className="grid gap-4 lg:grid-cols-12">
        {hasLeftColumn ? (
          <div className="space-y-4 lg:col-span-3">
            {hasStats ? (
              <>
                <StatColumn title="Defence" panels={gear.defencePanels} stats={stats} />
                <ResistanceBar stats={stats} />
                <AttributeStrip stats={stats} />
              </>
            ) : null}
            {/* The game's own export computes nothing, so a character read from it
                has no stats to show and this column carries its passives instead. */}
            {!hasStats && build.passives ? <PassivePanel passives={build.passives} /> : null}
          </div>
        ) : null}

        <div className={`space-y-4 ${hasLeftColumn ? "lg:col-span-6" : "lg:col-span-9"}`}>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Gear</h2>
              <span className="text-xs text-muted">{build.items.length} items</span>
            </div>
            <div className="p-4">
              {build.items.length ? (
                <GearGrid build={build} game={league.game} />
              ) : (
                <p className="py-8 text-center text-sm text-muted">No gear recorded.</p>
              )}
            </div>
          </section>

          {character.notes ? (
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Memories</h2>
              </div>
              <p className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-parchment/85 italic">
                {character.notes}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-3">
          {hasStats ? <StatColumn title="Offence" panels={gear.offencePanels} stats={stats} /> : null}

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Skills</h2>
              <span className="text-xs text-muted">{build.skillGroups.length} groups</span>
            </div>
            <SkillGroups groups={build.skillGroups} game={league.game} />
          </section>

          {tree ? (
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Passive tree</h2>
              </div>
              <div className="space-y-1 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Allocated</span>
                  <span className="tabular-nums">{tree.nodeCount}</span>
                </div>
                {tree.masteryCount ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Masteries</span>
                    <span className="tabular-nums">{tree.masteryCount}</span>
                  </div>
                ) : null}
                {build.bandit ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Bandit</span>
                    <span className="capitalize">{build.bandit}</span>
                  </div>
                ) : null}
                {tree.weaponSets ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted">Weapon set 1</span>
                      <span className="tabular-nums">{tree.weaponSets[1].length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Weapon set 2</span>
                      <span className="tabular-nums">{tree.weaponSets[2].length}</span>
                    </div>
                  </>
                ) : null}
                {tree.treeVersion ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Tree version</span>
                    <span className="tabular-nums">{tree.treeVersion}</span>
                  </div>
                ) : null}
                {build.trees.length > 1 ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Saved trees</span>
                    <span className="tabular-nums">{build.trees.length}</span>
                  </div>
                ) : null}
                {tree.url ? (
                  <a
                    href={tree.url}
                    target="_blank"
                    rel="noreferrer"
                    className="link-gold mt-3 inline-block text-xs tracking-[0.16em] uppercase"
                  >
                    Open the tree ↗
                  </a>
                ) : null}
                {build.origin ? (
                  <p className="pt-2 text-xs text-muted">
                    Read from {build.origin.account}
                    {build.origin.fetchedAt ? ` on ${build.origin.fetchedAt.slice(0, 10)}` : ""}.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {build.config.length ? (
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Configuration</h2>
              </div>
              <div className="space-y-1 p-4 text-xs">
                {build.config.map((entry) => (
                  <div key={entry.name} className="flex justify-between gap-3">
                    <span className="text-muted">{humanizeStatKey(entry.name)}</span>
                    <span className="text-right">{entry.value === "true" ? "yes" : entry.value}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* The whole window's width, not the page column's: a tree drawn small is
          a smudge, and on a 4K screen the 1400px column left it a postage stamp.
          The negative margins break out of the column symmetrically, so the
          panel stays centred under everything else, and keep the page's own
          1.25rem gutter; margins rather than a translate, because a transform
          would become the containing block for the tooltip's position: fixed.
          The tree is square, so width alone only adds empty sides — the box is
          as tall as the screen allows and never taller than it is wide. */}
      {treeArt && treeNodes.length ? (
        <section className="panel mx-[calc(50%_-_50vw_+_1.25rem)]">
          <div className="panel-header">
            <h2 className="panel-title">Passive tree</h2>
            <span className="text-xs text-muted">
              {treeArt.exact
                ? "scroll to zoom, drag to pan"
                : `drawn on the ${treeArt.version} tree — this build is ${tree?.treeVersion}, so some nodes sit elsewhere`}
            </span>
          </div>
          <div className="p-4">
            <PassiveTree
              src={treeArt.src}
              nodes={litNodes}
              clusters={clusters}
              masteries={masteries}
              overrides={overrides}
              weaponSets={tree?.weaponSets}
              choices={gear.choices(tree?.nodes, treeArt.version)}
              attributeChoices={tree?.attributeChoices}
              ascendancy={gear.treeAscendancy(character.ascendancy)}
              allocatedCount={tree?.nodeCount ?? treeNodes.length}
              treeVersion={tree?.treeVersion || treeArt.version}
              className="h-[max(420px,min(calc(100svh_-_8rem),calc(100vw_-_4.5rem)))]"
            />
          </div>
        </section>
      ) : null}

      {build.notes ? (
        <details className="panel group">
          <summary className="panel-header cursor-pointer list-none">
            <span className="panel-title">Build notes from Path of Building</span>
            <span className="text-xs text-muted group-open:hidden">open</span>
          </summary>
          <pre className="max-h-[28rem] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-parchment/75">
            {build.notes}
          </pre>
        </details>
      ) : null}

      {hasStats ? (
        <details className="panel group">
          <summary className="panel-header cursor-pointer list-none">
            <span className="panel-title">Every computed stat</span>
            <span className="text-xs text-muted group-open:hidden">{Object.keys(stats).length} values</span>
          </summary>
          <AllStatsTable stats={stats} />
        </details>
      ) : null}

      <CharacterAdmin
        username={user.username}
        game={league.game}
        league={league.slug}
        slug={character.slug}
        name={character.name}
        level={character.level}
        skillGem={character.skillGem}
        leagueModifiers={character.leagueModifiers}
        skills={skillNamesFor(league.game)}
        notes={character.notes}
        played={formatPlayedExact(character.playedMinutes)}
        isFavorite={character.isFavorite === 1}
      />
    </div>
  );
}
