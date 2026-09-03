"use client";

import { useActionState } from "react";
import { deleteCharacterAction, updateCharacterAction, type ActionState } from "@/lib/actions";
import { FormError, FormSuccess } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function CharacterAdmin({
  username,
  patch,
  slug,
  name,
  level,
  notes,
  played,
  isFavorite,
}: {
  username: string;
  patch: string;
  slug: string;
  name: string;
  level: number | null;
  notes: string | null;
  played: string | null;
  isFavorite: boolean;
}) {
  const [state, formAction] = useActionState(updateCharacterAction, INITIAL);

  return (
    <details className="panel group">
      <summary className="panel-header cursor-pointer list-none">
        <span className="panel-title">Manage this character</span>
        <span className="text-xs text-muted group-open:hidden">edit · re-import · delete</span>
        <span className="hidden text-xs text-muted group-open:inline">close</span>
      </summary>
      <div className="space-y-6 p-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="patch" value={patch} />
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
          <input type="hidden" name="patch" value={patch} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className="btn border-life/40 text-life hover:border-life hover:text-life">
            Delete character
          </button>
        </form>
      </div>
    </details>
  );
}
