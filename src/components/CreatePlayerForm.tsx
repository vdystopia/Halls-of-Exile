"use client";

import { useActionState } from "react";
import { createPlayerAction, type ActionState } from "@/lib/actions";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const INITIAL: ActionState = {};

export function CreatePlayerForm() {
  const [state, formAction] = useActionState(createPlayerAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          className="input"
          placeholder="TheBlastPath"
          autoComplete="off"
          required
        />
        <p className="mt-1 text-xs text-muted">
          3–24 characters. This becomes the public address of the archive: /players/your-name
        </p>
      </div>
      <div>
        <label className="label" htmlFor="firstName">
          First name
        </label>
        <input id="firstName" name="firstName" className="input" placeholder="Kirac" autoComplete="off" required />
      </div>
      <div>
        <label className="label" htmlFor="tagline">
          Tagline <span className="text-muted/60">(optional)</span>
        </label>
        <input
          id="tagline"
          name="tagline"
          className="input"
          placeholder="Righteous Fire enjoyer since Talisman"
          autoComplete="off"
        />
      </div>
      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Creating…">Create profile</SubmitButton>
        <span className="text-xs text-muted">No password — every profile in this archive is public.</span>
      </div>
    </form>
  );
}
