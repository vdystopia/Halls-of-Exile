"use server";

import { revalidatePath } from "next/cache";
import { applyChallenges, readChallengeFile, type ChallengeResult } from "./challenges";
import { getUser, listAllLeagues } from "./queries";

export type ChallengeState = {
  ok?: boolean;
  error?: string;
  result?: ChallengeResult;
  problems?: string[];
};

/** The challenge file from pathofexile.com, uploaded on the import page. */
export async function importChallengesAction(_prev: ChallengeState, formData: FormData): Promise<ChallengeState> {
  const username = String(formData.get("username") ?? "").trim();
  const user = getUser(username);
  if (!user) return { error: "Unknown player." };
  const file = formData.get("challenges");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the challenges JSON file first." };
  if (file.size > 8 * 1024 * 1024) return { error: "That file is over 8 MB, which is not a challenge export." };

  const read = readChallengeFile(await file.text());
  if (!read.leagues.length) return { error: read.problems[0] ?? "No leagues in the file.", problems: read.problems };

  const result = applyChallenges(user.id, read, listAllLeagues());
  revalidatePath(`/players/${user.username}`);
  revalidatePath("/players");
  revalidatePath("/");
  return { ok: true, result, problems: read.problems };
}
