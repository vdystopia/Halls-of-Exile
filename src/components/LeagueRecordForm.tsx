"use client";

import { useActionState } from "react";
import { saveLeagueRecordAction, type ActionState } from "@/lib/actions";
import { FormError, FormSuccess } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function LeagueRecordForm({
  username,
  patch,
  challengesCompleted,
  challengeTotal,
  notes,
}: {
  username: string;
  patch: string;
  challengesCompleted: number | null;
  challengeTotal: number;
  notes: string | null;
}) {
  const [state, formAction] = useActionState(saveLeagueRecordAction, INITIAL);

  return (
    <details className="panel group">
      <summary className="panel-header cursor-pointer list-none">
        <span className="panel-title">Record league progress</span>
        <span className="text-xs text-muted group-open:hidden">edit</span>
        <span className="hidden text-xs text-muted group-open:inline">close</span>
      </summary>
      <form action={formAction} className="space-y-4 p-4">
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="patch" value={patch} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="challengesCompleted">
              Challenges completed
            </label>
            <input
              id="challengesCompleted"
              name="challengesCompleted"
              type="number"
              min={0}
              className="input"
              defaultValue={challengesCompleted ?? ""}
              placeholder="32"
            />
          </div>
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
              defaultValue={challengeTotal}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="leagueNotes">
            League notes
          </label>
          <textarea
            id="leagueNotes"
            name="notes"
            rows={3}
            className="input resize-y"
            defaultValue={notes ?? ""}
            placeholder="Hit 40/40 the week before Kalandra. Best mapping league of my life."
          />
        </div>
        <FormError message={state.error} />
        <FormSuccess message={state.ok ? "Saved." : undefined} />
        <SubmitButton pendingLabel="Saving…">Save progress</SubmitButton>
      </form>
    </details>
  );
}
