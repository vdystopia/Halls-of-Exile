"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { setSlotItemAction, type ActionState } from "@/lib/actions";
import { FormError } from "../FormError";
import { SubmitButton } from "../SubmitButton";

const INITIAL: ActionState = {};

/** Which character and slot a paste goes to, and what is pasted there now. */
export type SlotEdit = {
  username: string;
  game: string;
  league: string;
  character: string;
  slot: string;
  /** The text pasted into this slot before, if any, so it can be edited or removed. */
  pasted: string | null;
};

/**
 * The small button in a slot's corner that takes an item copied from the game.
 * It opens a dialog with one text field: paste, save. A slot that already
 * holds a paste offers to remove it, which puts back whatever the build had
 * there. Its own mouse events stop at the button, so pressing it does not
 * also open the slot's tooltip.
 */
export function SlotPaste({ edit, occupied }: { edit: SlotEdit; occupied: boolean }) {
  const [open, setOpen] = useState(false);
  // A save closes the dialog; the page has already been revalidated by then.
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    const result = await setSlotItemAction(previous, formData);
    if (result.ok) setOpen(false);
    return result;
  }, INITIAL);

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          stop(event);
          setOpen(true);
        }}
        onMouseDown={stop}
        onMouseEnter={stop}
        title={edit.pasted ? `Edit the item pasted into ${edit.slot}` : `Paste an item into ${edit.slot}`}
        aria-label={edit.pasted ? `Edit the item pasted into ${edit.slot}` : `Paste an item into ${edit.slot}`}
        className={`absolute right-0.5 bottom-0.5 z-10 flex size-4 items-center justify-center rounded-sm border text-[10px] leading-none transition-opacity ${
          edit.pasted
            ? "border-gold/70 bg-surface-3 text-gold opacity-80 hover:opacity-100"
            : "border-line bg-surface-2 text-muted opacity-40 group-hover:opacity-90 hover:text-gold-bright"
        }`}
      >
        {edit.pasted ? "✎" : "+"}
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <form action={action} className="panel w-full max-w-xl space-y-3 p-4" onMouseEnter={stop}>
                <input type="hidden" name="username" value={edit.username} />
                <input type="hidden" name="game" value={edit.game} />
                <input type="hidden" name="league" value={edit.league} />
                <input type="hidden" name="slug" value={edit.character} />
                <input type="hidden" name="slot" value={edit.slot} />
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="panel-title">{edit.slot}</h3>
                  <span className="text-xs text-muted">
                    {occupied && !edit.pasted ? "replaces the item the build has here" : ""}
                  </span>
                </div>
                <textarea
                  name="item"
                  rows={14}
                  autoFocus
                  defaultValue={edit.pasted ?? ""}
                  placeholder={"Item Class: Belts\nRarity: Unique\nMageblood\nHeavy Belt\n--------\n…"}
                  className="input resize-y font-mono text-xs"
                />
                <p className="text-xs text-muted">
                  In the game, hover the item and press Ctrl+Alt+C (or Ctrl+C), then paste it here. The picture and
                  the tooltip follow from the text. A pasted item sits over the build and survives a re-import; remove
                  it to see what the build had.
                </p>
                <FormError message={state.error} />
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                  {edit.pasted ? (
                    <button type="submit" name="remove" value="1" className="btn text-xs">
                      Remove pasted item
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
