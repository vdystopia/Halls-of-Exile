"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn btn-gold",
  formAction,
  id,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  /** For a form with more than one button, the action this one submits to. */
  formAction?: (formData: FormData) => void;
  id?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button id={id} type="submit" className={className} disabled={pending} formAction={formAction}>
      {pending ? pendingLabel : children}
    </button>
  );
}
