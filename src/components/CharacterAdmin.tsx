"use client";

import { useActionState, useState } from "react";
import { deleteCharacterAction, updateCharacterAction, type ActionState } from "@/lib/actions";
import { LEAGUE_MODIFIERS, type LeagueModifierId } from "@/lib/league-modifiers";
import { FormError, FormSuccess } from "./FormError";
import { SkillOptions, SkillSelect } from "./SkillSelect";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function CharacterAdmin({
  username,
  game,
  league,
  slug,
  name,
  level,
  className,
  ascendancy,
  ascendancies,
  mainSkill,
  leagues,
  hasCode,
  hasExport,
  skillGem,
  leagueModifiers,
  skills,
  notes,
  played,
  isFavorite,
}: {
  username: string;
  game: string;
  league: string;
  slug: string;
  name: string;
  level: number | null;
  className: string;
  ascendancy: string | null;
  /** This game's classes and their ascendancies. */
  ascendancies: Record<string, string[]>;
  /** The record's own words for the build. */
  mainSkill: string | null;
  /** This game's leagues, newest first, for moving the character. */
  leagues: { slug: string; title: string }[];
  hasCode: boolean;
  /** Whether an account export is stored underneath, for the build to fall back to. */
  hasExport: boolean;
  skillGem: string | null;
  leagueModifiers: LeagueModifierId[];
  /** Every active skill gem, read on the server. See `SkillSelect`. */
  skills: string[];
  notes: string | null;
  played: string | null;
  isFavorite: boolean;
}) {
  const [state, formAction] = useActionState(updateCharacterAction, INITIAL);
  // The class picked in the form, which narrows the ascendancy list. It follows
  // the saved value when that changes: after a save React resets the form to
  // the new defaults, and a stale choice here would offer the old class's
  // ascendancies — and a second save would quietly write the old class back.
  const [chosenClass, setChosenClass] = useState(className);
  const [savedClass, setSavedClass] = useState(className);
  if (savedClass !== className) {
    setSavedClass(className);
    setChosenClass(className);
  }
  // A class not in the list — "Unknown", from a record that never said — is
  // still offered, so leaving the field alone changes nothing.
  const classes = Object.keys(ascendancies).includes(className)
    ? Object.keys(ascendancies)
    : [className, ...Object.keys(ascendancies)];
  const ascendancyOptions = ascendancies[chosenClass] ?? [];
  // The form is remounted whenever a saved value changes. React resets a form
  // after its action, but a select resets to the option it was first rendered
  // with, not to the saved one: the form went on showing the old class after a
  // save, and saving again wrote the old class back.
  const saved = JSON.stringify([name, level, className, ascendancy, mainSkill, skillGem, leagueModifiers, notes, played, isFavorite, league]);

  return (
    <details className="panel group">
      <summary className="panel-header cursor-pointer list-none">
        <span className="panel-title">Manage this character</span>
        <span className="text-xs text-muted group-open:hidden">edit · re-import · delete</span>
        <span className="hidden text-xs text-muted group-open:inline">close</span>
      </summary>
      <div className="space-y-6 p-4">
        <form key={saved} action={formAction} className="space-y-4">
          <SkillOptions options={skills} />
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="league" value={league} />
          <input type="hidden" name="slug" value={slug} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-name">
                Name
              </label>
              <input id="edit-name" name="name" className="input" defaultValue={name} />
            </div>
            <div>
              <label className="label" htmlFor="edit-level">
                Level
              </label>
              <input
                id="edit-level"
                name="level"
                type="number"
                min={1}
                max={100}
                className="input"
                defaultValue={level ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-class">
                Class
              </label>
              <select
                id="edit-class"
                name="className"
                className="input"
                defaultValue={className}
                onChange={(event) => setChosenClass(event.target.value)}
              >
                {classes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="edit-ascendancy">
                Ascendancy
              </label>
              <select
                // Remounted with the class, so an ascendancy of the old class is
                // never submitted under the new one.
                key={chosenClass}
                id="edit-ascendancy"
                name="ascendancy"
                className="input"
                defaultValue={chosenClass === className && ascendancy ? ascendancy : ""}
              >
                <option value="">None</option>
                {ascendancyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {chosenClass === className && ascendancy && !ascendancyOptions.includes(ascendancy) ? (
                  <option value={ascendancy}>{ascendancy}</option>
                ) : null}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="edit-league">
              League
            </label>
            <select id="edit-league" name="moveTo" className="input" defaultValue={league}>
              {leagues.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">Choosing another league moves the character there.</p>
          </div>
          <div>
            <label className="label" htmlFor="edit-main-skill">
              The build, in your own words
            </label>
            <input id="edit-main-skill" name="mainSkill" className="input" defaultValue={mainSkill ?? ""} />
            <p className="mt-1 text-xs text-muted">
              Prose, as the record names it. A pasted code fills this only when it is empty.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="edit-skill">
              Skill gem
            </label>
            <SkillSelect
              id="edit-skill"
              name="skillGem"
              defaultValue={skillGem}
              placeholder="Start typing a skill…"
            />
            <p className="mt-1 text-xs text-muted">
              The skill the character was built around, picked from the list — that is what draws the gem
              beside its name. A transfigured gem is not in the list and can be typed in full; a name the game
              does not have draws nothing. Emptying this clears it.
            </p>
          </div>
          <div>
            <span className="label">How the league was played</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {LEAGUE_MODIFIERS.map((modifier) => (
                <label
                  key={modifier.id}
                  className="flex items-center gap-2 text-sm text-muted"
                  title={modifier.title}
                >
                  <input
                    type="checkbox"
                    name="leagueModifiers"
                    value={modifier.id}
                    defaultChecked={leagueModifiers.includes(modifier.id)}
                    className="accent-[#c8aa6e]"
                  />
                  {modifier.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              One league runs as several at once — the same league, played under different rules. No export can
              say which, so this is the only place it is recorded.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="edit-played">
              Time played
            </label>
            <input id="edit-played" name="played" className="input" defaultValue={played ?? ""} />
            <p className="mt-1 text-xs text-muted">
              From <span className="font-mono">/played</span> in game. Leaving this blank clears it.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="edit-notes">
              Memories
            </label>
            <textarea id="edit-notes" name="notes" rows={3} className="input resize-y" defaultValue={notes ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="edit-pob">
              Re-import from Path of Building <span className="text-muted/60">(optional)</span>
            </label>
            <textarea
              id="edit-pob"
              name="pobInput"
              rows={3}
              className="input resize-y font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted">
              Replaces the build. Fields above that you have not changed take the code&apos;s class, ascendancy and
              level; anything you changed keeps your value.
            </p>
            {hasCode ? (
              <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="removeCode" className="accent-[#c8aa6e]" disabled={!hasExport} />
                {hasExport
                  ? "Remove the stored code and show the game's own export instead"
                  : "Remove the stored code (not possible: there is no export to fall back to)"}
              </label>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="favorite" defaultChecked={isFavorite} className="accent-[#c8aa6e]" />
            Pinned to the top of the league
          </label>
          <FormError message={state.error} />
          <FormSuccess message={state.ok ? "Character updated." : undefined} />
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </form>

        <form
          action={deleteCharacterAction}
          className="border-t border-line pt-4"
          onSubmit={(event) => {
            if (!window.confirm(`Delete ${name} from the archive? This cannot be undone.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="league" value={league} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className="btn border-life/40 text-life hover:border-life hover:text-life">
            Delete character
          </button>
        </form>
      </div>
    </details>
  );
}
