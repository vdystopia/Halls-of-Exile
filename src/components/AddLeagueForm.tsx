"use client";

import { useActionState } from "react";
import { addLeagueAction, type ActionState } from "@/lib/actions";
import { FormError, FormSuccess } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function AddLeagueForm({ returnTo }: { returnTo: string }) {
  const [state, formAction] = useActionState(addLeagueAction, INITIAL);

  return (
    <details className="panel group">
      <summary className="panel-header cursor-pointer list-none">
        <span className="panel-title">Add a league</span>
        <span className="text-xs text-muted group-open:hidden">
          missing a patch, a private league or an event?
        </span>
        <span className="hidden text-xs text-muted group-open:inline">close</span>
      </summary>
      <form action={formAction} className="space-y-4 p-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="patch">
              Patch
            </label>
            <input id="patch" name="patch" className="input" placeholder="3.29" required />
          </div>
          <div>
            <label className="label" htmlFor="leagueName">
              League name
            </label>
            <input id="leagueName" name="name" className="input" placeholder="Name of the league" required />
          </div>
          <div>
            <label className="label" htmlFor="startDate">
              Start date
            </label>
            <input id="startDate" name="startDate" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="endDate">
              End date
            </label>
            <input id="endDate" name="endDate" type="date" className="input" />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
            <input type="checkbox" name="endDateEstimated" className="accent-[#c8aa6e]" />
            End date is an estimate
          </label>
          <div>
            <label className="label" htmlFor="challengeTotal">
              Challenge total
            </label>
            <input
              id="challengeTotal"
              name="challengeTotal"
              type="number"
              min={1}
              className="input"
              defaultValue={40}
            />
          </div>
        </div>
        <FormError message={state.error} />
        <FormSuccess message={state.ok ? "League added — it now appears in every player's index." : undefined} />
        <SubmitButton pendingLabel="Adding…">Add league</SubmitButton>
      </form>
    </details>
  );
}
