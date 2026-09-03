"use client";

import { useActionState, useState } from "react";
import { addCharacterAction, type ActionState } from "@/lib/actions";
import { ASCENDANCIES, CLASSES } from "@/lib/leagues";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function AddCharacterForm({ username, patch }: { username: string; patch: string }) {
  const [state, formAction] = useActionState(addCharacterAction, INITIAL);
  const [mode, setMode] = useState<"pob" | "manual">("pob");
  const [className, setClassName] = useState<string>("Witch");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="patch" value={patch} />
      <input type="hidden" name="mode" value={mode} />

      <div className="flex gap-2">
        {(["pob", "manual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`btn px-4 py-1.5 text-xs tracking-[0.18em] uppercase ${
              mode === value ? "btn-gold" : ""
            }`}
          >
            {value === "pob" ? "Import build" : "Enter by hand"}
          </button>
        ))}
      </div>

      {mode === "pob" ? (
        <div className="panel p-4">
          <label className="label" htmlFor="pobInput">
            Path of Building code or link
          </label>
          <textarea
            id="pobInput"
            name="pobInput"
            rows={6}
            className="input resize-y font-mono text-xs"
          />
          <p className="mt-2 text-xs text-muted">
            Accepts a raw export code, or a link from pobb.in, pastebin or poe.ninja. Gear, gems, tree and every
            computed stat are pulled in and stored with the character.
          </p>
        </div>
      ) : (
        <div className="panel grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="className">
              Class
            </label>
            <select
              id="className"
              name="className"
              className="input"
              value={className}
              onChange={(event) => setClassName(event.target.value)}
            >
              {CLASSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ascendancy">
              Ascendancy
            </label>
            <select id="ascendancy" name="ascendancy" className="input" defaultValue="">
              <option value="">None</option>
              {(ASCENDANCIES[className] ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mainSkill">
              Main skill
            </label>
            <input id="mainSkill" name="mainSkill" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="level">
              Level
            </label>
            <input id="level" name="level" type="number" min={1} max={100} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="life">
              Life
            </label>
            <input id="life" name="life" type="number" min={0} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="energyShield">
              Energy shield
            </label>
            <input id="energyShield" name="energyShield" type="number" min={0} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="dps">
              DPS
            </label>
            <input id="dps" name="dps" type="number" min={0} className="input" />
          </div>
        </div>
      )}

      <div className="panel grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Character name
          </label>
          <input id="name" name="name" className="input" required={mode === "manual"} />
          {mode === "pob" ? (
            <p className="mt-1 text-xs text-muted">
              Optional — the main skill is used if you leave it blank. Level comes from the import.
            </p>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="played">
            Time played <span className="text-muted/60">(optional)</span>
          </label>
          <input id="played" name="played" className="input" />
          <p className="mt-1 text-xs text-muted">
            From <span className="font-mono">/played</span> in game. &ldquo;5d 3h&rdquo; or &ldquo;12h30m&rdquo;.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Memories <span className="text-muted/60">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="input resize-y"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
          <input type="checkbox" name="favorite" className="accent-[#c8aa6e]" />
          Pin this character to the top of the league
        </label>
      </div>

      <FormError message={state.error} />
      <SubmitButton pendingLabel="Archiving…">Add to the archive</SubmitButton>
    </form>
  );
}
