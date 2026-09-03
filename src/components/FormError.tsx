export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded border border-life/40 bg-life/10 px-3 py-2 text-sm text-life" role="alert">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold-bright" role="status">
      {message}
    </p>
  );
}
