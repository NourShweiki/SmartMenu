/**
 * Postgres refusals that mean "not allowed / not a legal move" rather than "something broke":
 *   42501 = insufficient privilege (a row-level security policy or a missing grant said no),
 *   23514 = check violation (our status-flow triggers raise it for a move the lifecycle does not have).
 * An adapter answers these with `false` (the change did not happen); anything else is thrown.
 */
export const REFUSED: ReadonlySet<string> = new Set(["42501", "23514"]);
