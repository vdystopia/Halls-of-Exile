"use client";

import { useActionState } from "react";
import { importPoeExportAction, previewPoeExportAction, type ImportState } from "@/lib/actions";
import type { GameId } from "@/lib/games/types";
import type { ImportRow } from "@/lib/import";
import type { League } from "@/lib/types";
import { FormError } from "./FormError";
import { SkillOptions, SkillSelect } from "./SkillSelect";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ImportState = {};

const CONFIDENCE: Record<string, string> = {
  certain: "the league it is still in",
  likely: "last played inside that league",
  ambiguous: "two leagues overlap that date",
  weak: "already migrated, or a bulk login",
  none: "no usable signal",
};

function rowKey(row: ImportRow) {
  return `${row.name}:${row.action}`;
}

/**
 * Upload an export, look at what it would do, then do it.
 *
 * Preview and import are two actions on one form. The file is only uploaded
 * once: the first action stages it on the server and the plan carries the name
 * it was stored under, which the second action submits instead. That is not a
 * saving so much as a necessity — React resets the form when an action
 * returns, so by the time the second button is pressed the file input is empty.
 */
export function ImportExportForm({
  username,
  leagues,
  skills,
}: {
  username: string;
  /** Both games' leagues; a plan offers only its own game's. */
  leagues: League[];
  /** Every active skill gem per game, read on the server. See `SkillSelect`. */
  skills: Record<GameId, string[]>;
}) {
  const [preview, previewAction] = useActionState(previewPoeExportAction, INITIAL);
  const [result, importAction] = useActionState(importPoeExportAction, INITIAL);
  // Whichever ran last is what the page is showing.
  const state = result.plan || result.error ? result : preview;
  const plan = state.plan;
  const game: GameId = plan?.game ?? "poe1";
  const gameLeagues = leagues.filter((league) => league.game === game);

  const counts = {
    fill: plan?.rows.filter((row) => row.action === "update" && !row.finalised).length ?? 0,
    archived: plan?.rows.filter((row) => row.finalised).length ?? 0,
    create: plan?.rows.filter((row) => row.action === "create").length ?? 0,
    ambiguous: plan?.rows.filter((row) => row.action === "ambiguous").length ?? 0,
  };

  return (
    <form className="space-y-4">
      <SkillOptions options={skills[game]} />
      <input type="hidden" name="username" value={username} />

      <div className="panel space-y-3 p-4">
        <label className="label" htmlFor="export">
          Export file
        </label>
        <input
          id="export"
          name="export"
          type="file"
          accept="application/json,.json"
          className="input file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-xs file:text-parchment"
        />
        {/* React clears the form once an action returns, so the file itself is
            gone by the second button. The plan names the copy kept on the
            server, and that name is what the import submits. */}
        {plan ? <input type="hidden" name="token" value={plan.token} /> : null}
        <p className="text-xs text-muted">
          Either game&rsquo;s export. For Path of Exile, the JSON <code className="font-mono">poe-char-export</code>{" "}
          writes — gear, socketed gems and the passive tree for every character on one account. For Path of Exile
          2, the JSON <code className="font-mono">poe2-char-export.js</code> saves from your own characters page
          on pathofexile2.com — gear, both weapon sets, charms, runes and the skills items grant, but no passive
          tree and no skill gems, which that site does not serve. The file says which game it is from; this page
          only reads it.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <SubmitButton formAction={previewAction} pendingLabel="Reading…" className="btn">
            Look at the file
          </SubmitButton>
          {plan ? (
            <SubmitButton formAction={importAction} pendingLabel="Importing…">
              Import the ticked rows
            </SubmitButton>
          ) : null}
        </div>
        <FormError message={state.error} />
        {result.ok && state === result ? (
          <p className="text-sm text-gold">
            {result.imported} character{result.imported === 1 ? "" : "s"} imported
            {result.created ? `, ${result.created} newly created` : ""}.
          </p>
        ) : null}
      </div>

      {plan ? (
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              {plan.account} · {game === "poe2" ? "Path of Exile 2" : "Path of Exile"}
            </h2>
            <span className="text-xs text-muted">
              {counts.fill} to fill in · {counts.archived} already archived · {counts.create} not in the archive
              {counts.ambiguous ? ` · ${counts.ambiguous} ambiguous` : ""}
            </span>
          </div>
          {plan.skippedCharacters.length ? (
            <p className="border-b border-line px-4 py-2.5 text-xs text-life">
              Not in this file, because their gear could not be read when it was exported:{" "}
              {plan.skippedCharacters.join(", ")}. Export again to include them.
            </p>
          ) : null}
          {plan.emptyCharacters.length ? (
            <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
              Left out, because the account holds nothing for them — no gear, no skills, no passives:{" "}
              {plan.emptyCharacters.join(", ")}. Archiving one would record an empty build as finished.
            </p>
          ) : null}
          <ul className="divide-y divide-line">
            {plan.rows.map((row) => (
              <li key={rowKey(row)} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <input
                  type="checkbox"
                  name={`include:${row.name}`}
                  // Ticked only where nothing is at stake: an archived character
                  // with no build yet, or a league the export was sure of. A
                  // character that already holds a build is never ticked for
                  // you, whatever else is true of it — ticking it is the order
                  // to replace what was archived, and it has to be given.
                  defaultChecked={!row.finalised && (row.action === "update" || Boolean(row.suggested))}
                  disabled={row.action === "ambiguous"}
                  aria-label={`Import ${row.name}`}
                  className="accent-gold"
                />
                <span className="min-w-40 flex-1 font-semibold text-parchment">{row.name}</span>
                <span className="min-w-44 text-xs text-muted">
                  {`Level ${row.level ?? "?"} ${row.ascendancy ?? row.className ?? ""}`.trim()}
                </span>

                {row.action === "update" && row.target ? (
                  row.finalised ? (
                    <span className="min-w-56 text-xs text-muted">
                      already archived in <span className="text-parchment/80">{row.target.leagueTitle}</span>
                      <span className="text-muted/70"> — tick to replace it</span>
                    </span>
                  ) : (
                    <span className="min-w-56 text-xs text-muted">
                      fills in <span className="text-parchment/80">{row.target.leagueTitle}</span>
                    </span>
                  )
                ) : null}

                {row.action === "ambiguous" ? (
                  <span className="min-w-56 text-xs text-life">
                    {row.matches} characters share this name — rename one first
                  </span>
                ) : null}

                {row.action === "create" ? (
                  <label className="flex min-w-56 items-center gap-2 text-xs text-muted">
                    <span className="sr-only">League for {row.name}</span>
                    <select
                      name={`league:${row.name}`}
                      defaultValue={row.suggested ?? ""}
                      className="input px-2 py-1 text-xs"
                    >
                      <option value="">Do not import</option>
                      {gameLeagues.map((league) => (
                        <option key={league.slug} value={league.slug}>
                          {league.patch ?? "###"} {league.name}
                        </option>
                      ))}
                    </select>
                    <span title={`in ${row.currentLeague} now`}>
                      {row.confidence ? CONFIDENCE[row.confidence] ?? row.confidence : ""}
                    </span>
                  </label>
                ) : null}

                {/* The skill this character is remembered by. Offered on every
                    row that can be imported, because it is the field that
                    decides which gem is drawn beside the name and the export
                    can only guess at it.

                    It grows with the row: a transfigured gem's name runs to
                    "Static Strike of Gathering Lightning", and a field showing
                    half of it is a field nobody can check. */}
                {row.action === "ambiguous" ? null : (
                  <span className="flex min-w-56 flex-1 items-center gap-2">
                    <SkillSelect
                      name={`skill:${row.name}`}
                      defaultValue={row.skill}
                      aria-label={`Main skill for ${row.name}`}
                      placeholder="Main skill"
                      className={`input w-full px-2 py-1 text-xs ${row.skillGuessed ? "text-parchment/70 italic" : ""}`}
                    />
                    {row.skillGuessed ? (
                      <span className="shrink-0 text-xs text-muted" title="The exporter's guess — check it">
                        guessed
                      </span>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            A character that already holds a build is left exactly as it was archived unless you tick it: what
            the account holds today is not what it held when it was finished, and for an old character the
            difference is however much gear has been pulled off it since. An empty one is filled in, keeping its
            league, memories, playtime and main skill. A character the archive has never seen is created only in
            a league picked here — the export cannot say which league a character was made in, only which one it
            sits in now.
          </p>
        </section>
      ) : null}
    </form>
  );
}
