"use client";

import { deletePlayerAction } from "@/lib/actions";

/**
 * Folded away by default: this is the one control in the archive that destroys
 * more than the thing it names, since a player's characters and league records
 * go with them.
 */
export function PlayerAdmin({ username, characters }: { username: string; characters: number }) {
  const warning =
    characters > 0
      ? `Delete ${username} and their ${characters} character${characters === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete ${username}? This cannot be undone.`;

  return (
    <details className="panel p-4">
      <summary className="cursor-pointer text-sm text-muted">Manage player</summary>
      <form
        action={deletePlayerAction}
        className="mt-4 border-t border-line pt-4"
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
