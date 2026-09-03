import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterAdmin } from "@/components/CharacterAdmin";
import { CopyButton } from "@/components/CopyButton";
import { GearGrid } from "@/components/GearGrid";
import { SkillGroups } from "@/components/SkillGroups";
import { AllStatsTable, AttributeStrip, ResistanceBar, StatColumn } from "@/components/StatPanels";
import { classLine, leagueWindow } from "@/lib/format";
import { getCharacter, getLeagueByPatch, getUser } from "@/lib/queries";
import { DEFENCE_PANELS, humanizeStatKey, OFFENCE_PANELS } from "@/lib/stats";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string; patch: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { username, patch, slug } = await params;
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  const character = user && league ? getCharacter(user.id, league.id, slug) : null;
  return { title: character ? `${character.name} · ${patch} · ${username}` : "Character" };
}

export default async function CharacterPage({ params }: Props) {
  const { username, patch, slug } = await params;
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  if (!user || !league) notFound();
  const character = getCharacter(user.id, league.id, slug);
  if (!character) notFound();

  const build = character.data;
  const stats = build.stats ?? {};
  const tree = build.trees?.[build.activeTree] ?? build.trees?.[0];
  const hasStats = Object.keys(stats).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/players/${user.username}`} className="link-gold tracking-[0.18em] uppercase">
          {user.username}
        </Link>
        <span className="text-muted">/</span>
        <Link href={`/players/${user.username}/${league.patch}`} className="link-gold tracking-[0.18em] uppercase">
          {league.patch} {league.name}
        </Link>
      </div>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="display text-3xl">{character.name}</h1>
              {character.isFavorite ? <span className="text-lg text-gold">★</span> : null}
            </div>
            <p className="mt-2 text-parchment/80">
              {character.level ? `Level ${character.level} · ` : ""}
              {classLine(character.className, character.ascendancy)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {character.mainSkill ? (
                <span className="tag border-rarity-gem/40 text-rarity-gem">{character.mainSkill}</span>
              ) : null}
              <span className="tag">
                {league.patch} {league.name}
              </span>
              {build.bandit ? <span className="tag">bandit: {build.bandit}</span> : null}
              {build.pobVersion ? <span className="tag">PoB target {build.pobVersion}</span> : null}
              {tree?.treeVersion ? <span className="tag">tree {tree.treeVersion}</span> : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <p className="text-xs text-muted">
              {leagueWindow(league.startDate, league.endDate, Boolean(league.endDateEstimated))}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {character.pobUrl ? (
                <a href={character.pobUrl} target="_blank" rel="noreferrer" className="btn px-3 py-1.5 text-xs">
                  Source ↗
                </a>
              ) : null}
              {character.pobCode ? <CopyButton value={character.pobCode} /> : null}
            </div>
          </div>
        </div>
      </header>

      {!hasStats && build.items.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          This character was written down by hand. Import a Path of Building export from “Manage this character”
          to fill in gear, gems, tree and stats.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <StatColumn title="Defence" panels={DEFENCE_PANELS} stats={stats} />
          <ResistanceBar stats={stats} />
          <AttributeStrip stats={stats} />
        </div>

        <div className="space-y-4 lg:col-span-6">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Equipment</h2>
              <span className="text-xs text-muted">{build.items.length} items</span>
            </div>
            <div className="p-4">
              {build.items.length ? (
                <GearGrid build={build} />
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
          <StatColumn title="Offence" panels={OFFENCE_PANELS} stats={stats} />

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Skills</h2>
              <span className="text-xs text-muted">{build.skillGroups.length} groups</span>
            </div>
            <SkillGroups groups={build.skillGroups} />
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
        patch={league.patch}
        slug={character.slug}
        name={character.name}
        level={character.level}
        notes={character.notes}
        isFavorite={character.isFavorite === 1}
      />
    </div>
  );
}
