"use client";

import { useActionState } from "react";
import { deletePlayerAction, renamePlayerAction, type ActionState } from "@/lib/actions";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

/**
 * Folded away by default. Renaming moves every one of the player's pages, since
 * the username is their address; deleting takes their characters and league
 * records with them, which is why it asks first.
 */
export function PlayerAdmin({
  username,
  firstName,
  tagline,
  characters,
}: {
  username: string;
  firstName: string;
  tagline: string | null;
  characters: number;
}) {
  const [state, renameAction] = useActionState(renamePlayerAction, INITIAL);
  const warning =
    characters > 0
      ? `Delete ${username} and their ${characters} character${characters === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete ${username}? This cannot be undone.`;

  return (
    <details className="panel p-4">
      <summary className="cursor-pointer text-sm text-muted">Manage player</summary>

      <form action={renameAction} className="mt-4 space-y-4 border-t border-line pt-4">
        <input type="hidden" name="username" value={username} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="newUsername">
              Username
            </label>
            <input
              id="newUsername"
              name="newUsername"
              className="input"
              defaultValue={username}
              autoComplete="off"
              required
            />
            <p className="mt-1 text-xs text-muted">
              3–24 characters. Their pages move to /players/&lt;this&gt;, so old links stop working.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="firstName">
              Display name
            </label>
            <input
              id="firstName"
              name="firstName"
              className="input"
              defaultValue={firstName}
              autoComplete="off"
              required
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tagline">
            Tagline <span className="text-muted/60">(optional)</span>
          </label>
          <input id="tagline" name="tagline" className="input" defaultValue={tagline ?? ""} autoComplete="off" />
        </div>
        <FormError message={state.error} />
        <SubmitButton pendingLabel="Renaming…">Save changes</SubmitButton>
      </form>

      <form
        action={deletePlayerAction}
        className="mt-6 border-t border-line pt-4"
        onSubmit={(event) => {
          if (!window.confirm(warning)) event.preventDefault();
        }}
      >
        <input type="hidden" name="username" value={username} />
        <p className="mb-3 text-sm text-muted">
          Deleting a player also deletes their characters and league records.
        </p>
        <button type="submit" className="btn border-life/40 text-life hover:border-life hover:text-life">
          Delete player
        </button>
      </form>
    </details>
  );
}
