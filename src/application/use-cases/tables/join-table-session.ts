import type { PublicSession, TableSessionGateway } from "@/application/ports/table-session-gateway";
import { TOKEN_PATTERN } from "@/domain/table-session/table-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A customer scanned a table's QR code: join that table's live session (starting one if there is none).
 * Public: no login. `slug` comes from the host. A token that cannot possibly be valid is refused here without
 * touching the database, so junk links cost nothing; the database does the real check.
 */
export function makeJoinTableSession(deps: { sessions: TableSessionGateway }) {
  return async (input: { slug: string; token: string }): Promise<PublicSession | null> =>
    TOKEN_PATTERN.test(input.token) ? deps.sessions.join(input.slug, input.token) : null;
}

/** A device that already holds a session id checks it is still valid for this restaurant. */
export function makeGetPublicSession(deps: { sessions: TableSessionGateway }) {
  return async (input: { slug: string; sessionId: string }): Promise<PublicSession | null> =>
    UUID.test(input.sessionId) ? deps.sessions.find(input.slug, input.sessionId) : null;
}
