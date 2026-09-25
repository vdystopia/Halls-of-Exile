/**
 * What a player may be called. A username is the URL segment under /players/,
 * so it cannot be the name of a page that already lives there: a player called
 * "new" was created and then unreachable, since /players/new is the form that
 * creates players. `tests/usernames.test.ts` fails if a page is added under
 * src/app/players/ without its name joining this list.
 */
export const RESERVED_USERNAMES = ["new"];

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

/** Why a username is refused, or null when it is fine. */
export function usernameProblem(username: string): string | null {
  if (!USERNAME_RE.test(username)) return "Username must be 3-24 characters: letters, numbers, hyphen or underscore.";
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) return `"${username}" is the name of a page; pick another username.`;
  return null;
}
