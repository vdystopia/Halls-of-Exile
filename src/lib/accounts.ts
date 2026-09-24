/**
 * The Path of Exile accounts this archive's players play on.
 *
 * Account names are public — they are what the character list is served under,
 * and the profile page shows them to anyone — so there is nothing to protect
 * here and no reason to make anyone type them in. Keeping them in code means
 * the collector works the moment the archive boots, with no setup step to
 * forget, which is the same reason the league catalogue lives in `leagues.ts`.
 *
 * Applied by `backfillAccounts` on every boot, and like everything else that
 * touches an existing row it only ever fills a blank: an account changed under
 * "Manage player" is never overwritten by this, and one another player already
 * holds is left alone. So this is the starting point, not the last word.
 *
 * A player not listed here is not a problem. Their account is worked out from
 * the first characters they import, or given once as
 * `.\collect.ps1 -Player <name> -Account "Name#1234"`.
 */
export const ACCOUNT_SEED: Record<string, string> = {
  dystopia: "zxBlasphemy#5164",
  valkyrie: "ValkyrieVron#0739",
};
