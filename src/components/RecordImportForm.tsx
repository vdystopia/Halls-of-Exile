"use client";

import { useActionState } from "react";
import { importRecordAction, type RecordState } from "@/lib/actions";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: RecordState = {};

/**
 * Upload the owner's record as a spreadsheet: the first step of the initial
 * population, before any export. One row per character with the facts no export
 * carries. The rules are in `src/lib/record.ts`; the form only reports.
 */
export function RecordImportForm({ username }: { username: string }) {
  const [state, action] = useActionState(importRecordAction, INITIAL);
  const result = state.result;

  return (
    <form action={action} className="panel space-y-3 p-4">
      <input type="hidden" name="username" value={username} />
      <label className="label" htmlFor="record">
        Character record (spreadsheet)
      </label>
      <input
        id="record"
        name="record"
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        className="input file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-xs file:text-parchment"
      />
      <p className="text-xs text-muted">
        A CSV (or tab-separated) file with a header row. Columns, any order, any of these spellings:{" "}
        <span className="text-parchment/80">name</span> (required), game (poe1 or poe2, default poe1), league (a
        patch like 3.25, or a league&rsquo;s name or slug; default &ldquo;unspecified&rdquo;), level, class, ascendancy,
        skill or build, skill gem, played (&ldquo;5d 3h&rdquo;, or a bare number of hours; a column headed &ldquo;played
        minutes&rdquo; is minutes), notes, mode (SSF, Hardcore, Ruthless), failed or status. A character is matched
        by league and name and updated in place; a new one is created. One that already holds gear from the game
        or a build code keeps it and only has its blank record fields filled. A build written as &ldquo;failed
        …&rdquo; marks the character failed.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Applying…" className="btn btn-gold">
          Apply the record
        </SubmitButton>
        {result ? (
          <span className="text-xs text-muted">
            {result.created} created · {result.updated} updated · {result.filled} filled in around a stored build ·{" "}
            {result.skipped.length} skipped
          </span>
        ) : null}
      </div>
      <FormError message={state.error} />
      {result?.skipped.length ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {result.skipped.map((entry) => (
            <li key={`${entry.name}:${entry.reason}`}>
              <span className="text-parchment/80">{entry.name}</span>: {entry.reason}
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
