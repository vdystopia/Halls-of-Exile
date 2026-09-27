"use client";

import { useActionState } from "react";
import { importChallengesAction, type ChallengeState } from "@/lib/challenge-actions";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ChallengeState = {};

/**
 * Upload the challenge history read off pathofexile.com's account page: one
 * JSON file per account, every league, every challenge with its sub-items.
 * The rules are in `src/lib/challenges.ts`; the form only reports.
 */
export function ChallengeImportForm({ username }: { username: string }) {
  const [state, action] = useActionState(importChallengesAction, INITIAL);
  const result = state.result;

  return (
    <form action={action} className="panel space-y-3 p-4">
      <input type="hidden" name="username" value={username} />
      <label className="label" htmlFor="challenges">
        Challenge history (JSON)
      </label>
      <input
        id="challenges"
        name="challenges"
        type="file"
        accept=".json,application/json"
        className="input file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-xs file:text-parchment"
      />
      <p className="text-xs text-muted">
        The file read off the Challenges tab of the account page on pathofexile.com. Every league with a challenge
        completed is stored in full, in the site&rsquo;s order, and counts as played whether or not a character is
        filed under it; its completed count becomes the league&rsquo;s record. A league with nothing completed is
        taken as not played. Ruthless variants are never read. Uploading again replaces what was stored and keeps
        any notes written here.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Applying…" className="btn btn-gold">
          Apply the challenges
        </SubmitButton>
        {result ? (
          <span className="text-xs text-muted">
            {result.account}: {result.imported.length} league{result.imported.length === 1 ? "" : "s"} stored ·{" "}
            {result.notParticipated} not played · {result.ruthless} Ruthless skipped
            {result.unmapped.length ? ` · ${result.unmapped.length} not in the catalogue` : ""}
          </span>
        ) : null}
      </div>
      <FormError message={state.error} />
      {result?.imported.length ? (
        <ul className="grid gap-x-6 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
          {result.imported.map((entry) => (
            <li key={entry.league}>
              <span className="text-parchment/80">{entry.league}</span>: {entry.completed}/{entry.total}
            </li>
          ))}
        </ul>
      ) : null}
      {result?.unmapped.length ? (
        <ul className="space-y-0.5 text-xs text-life/80">
          {result.unmapped.map((entry) => (
            <li key={entry.league}>
              &ldquo;{entry.league}&rdquo; ({entry.completed}/{entry.total}) is not a league the catalogue knows; nothing stored.
            </li>
          ))}
        </ul>
      ) : null}
      {result?.totalsDiffer.length ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {result.totalsDiffer.map((entry) => (
            <li key={entry.league}>
              {entry.league}: the site counts {entry.site} challenges, the catalogue {entry.catalogue ?? "none"}; the
              site&rsquo;s figure is used here.
            </li>
          ))}
        </ul>
      ) : null}
      {state.problems?.length ? (
        <ul className="space-y-0.5 text-xs text-life/80">
          {state.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
