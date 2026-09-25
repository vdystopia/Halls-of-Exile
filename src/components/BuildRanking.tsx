"use client";

import { type ReactNode, useState } from "react";

const MODES = [
  { id: "characters", label: "By characters" },
  { id: "played", label: "By /played" },
] as const;

type Mode = (typeof MODES)[number]["id"];

/**
 * The top builds ranked two ways: by how many characters used the skill, and
 * by the hours they got. Both rankings are rendered on the server — the cards
 * resolve gem art, which must stay there — and this only chooses which to show.
 */
export function BuildRanking({ byCharacters, byPlayed }: { byCharacters: ReactNode; byPlayed: ReactNode }) {
  const [mode, setMode] = useState<Mode>("characters");
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Rank builds" className="flex gap-2">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            onClick={() => setMode(option.id)}
            className={`tag cursor-pointer ${mode === option.id ? "border-gold/70 text-gold-bright" : "hover:text-parchment"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === "characters" ? byCharacters : byPlayed}
    </div>
  );
}
