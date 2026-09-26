"use client";

import { useActionState } from "react";
import {
  addLeagueAction,
  deleteLeagueAction,
  updateLeagueAction,
  type ActionState,
} from "@/lib/actions";
import { FormError, FormSuccess } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

/** A hand-added league, as the edit form needs it. */
export type CustomLeague = {
  game: string;
  slug: string;
  patch: string | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  endDateEstimated: boolean;
  challengeTotal: number | null;
};

/**
 * Adding a league the catalogue lacks, or — given `league` — editing or
 * deleting one that was added by hand. The catalogue's own rows are code-owned
 * and never offered here. The game and patch are the league's key, so they are
 * chosen once and not edited: a wrong one is deleted and added again.
 */
export function AddLeagueForm({ returnTo, league }: { returnTo: string; league?: CustomLeague }) {
  const [state, formAction] = useActionState(league ? updateLeagueAction : addLeagueAction, INITIAL);
  const [deleted, deleteAction] = useActionState(deleteLeagueAction, INITIAL);

  return (
    <details className="panel group">
      <summary className="panel-header cursor-pointer list-none">
        <span className="panel-title">{league ? "Manage this league" : "Add a league"}</span>
        <span className="text-xs text-muted group-open:hidden">
          {league ? "added by hand · edit · delete" : "missing a patch, a private league or an event?"}
        </span>
        <span className="hidden text-xs text-muted group-open:inline">close</span>
      </summary>
      <form action={formAction} className="space-y-4 p-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        {league ? (
          <>
            <input type="hidden" name="game" value={league.game} />
            <input type="hidden" name="slug" value={league.slug} />
          </>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {league ? null : (
            <>
              <div>
                <label className="label" htmlFor="leagueGame">
                  Game
                </label>
                <select id="leagueGame" name="game" className="input" defaultValue="poe1">
                  <option value="poe1">Path of Exile</option>
                  <option value="poe2">Path of Exile 2</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="patch">
                  Patch
                </label>
                <input id="patch" name="patch" className="input" required />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="leagueName">
              League name
            </label>
            <input id="leagueName" name="name" className="input" required defaultValue={league?.name} />
          </div>
          <div>
            <label className="label" htmlFor="challengeTotal">
              Challenge total <span className="text-muted/60">(blank if unknown)</span>
            </label>
            <input
              id="challengeTotal"
              name="challengeTotal"
              type="number"
              min={1}
              className="input"
              defaultValue={league?.challengeTotal ?? undefined}
            />
          </div>
          <div>
            <label className="label" htmlFor="startDate">
              Start date
            </label>
            <input id="startDate" name="startDate" type="date" className="input" defaultValue={league?.startDate ?? undefined} />
          </div>
          <div>
            <label className="label" htmlFor="endDate">
              End date
            </label>
            <input id="endDate" name="endDate" type="date" className="input" defaultValue={league?.endDate ?? undefined} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
            <input
              type="checkbox"
              name="endDateEstimated"
              className="accent-[#c8aa6e]"
              defaultChecked={league?.endDateEstimated}
            />
            End date is an estimate (the game&apos;s newest league only)
          </label>
        </div>
        <FormError message={state.error} />
        <FormSuccess
          message={
            state.ok ? (league ? "League updated." : "League added — it now appears in every player's index.") : undefined
          }
        />
        <SubmitButton pendingLabel={league ? "Saving…" : "Adding…"}>{league ? "Save league" : "Add league"}</SubmitButton>
      </form>
      {league ? (
        <form
          action={deleteAction}
          className="border-t border-line p-4"
          onSubmit={(event) => {
            if (!window.confirm(`Delete ${league.name} from the archive?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="game" value={league.game} />
          <input type="hidden" name="slug" value={league.slug} />
          <input type="hidden" name="returnTo" value={returnTo.split("/").slice(0, 3).join("/")} />
          <FormError message={deleted.error} />
          <button type="submit" className="btn border-life/40 text-life hover:border-life hover:text-life">
            Delete league
          </button>
          <p className="mt-2 text-xs text-muted">Only possible once no character or league record is filed under it.</p>
        </form>
      ) : null}
    </details>
  );
}
