import Link from "next/link";
import { CreatePlayerForm } from "@/components/CreatePlayerForm";

export const metadata = { title: "Create a profile · Halls of the Champions" };

export default function NewPlayerPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/players" className="link-gold text-xs tracking-[0.18em] uppercase">
          ← Players
        </Link>
        <h1 className="display mt-3 text-3xl">Create a profile</h1>
        <p className="mt-2 text-sm text-parchment/75">
          Two fields. That is the whole account. Characters and leagues attach to it from here.
        </p>
      </div>
      <div className="panel p-6">
        <CreatePlayerForm />
      </div>
    </div>
  );
}
