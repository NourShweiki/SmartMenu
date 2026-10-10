import type { TableRepository } from "@/application/ports/table-repository";
import type { Clock, IdGenerator, TokenGenerator } from "@/application/ports/system";
import { err, ok, type Result } from "@/domain/shared/result";
import {
  createTable,
  deleteTable,
  regenerateToken,
  renameTable,
  setTableActive,
  type Table,
  type TableId,
} from "@/domain/table-session/table-session";
import { requireTablePermission, type TableActor, type TableUseCaseError } from "./shared";

type Deps = { tables: TableRepository; ids: IdGenerator; tokens: TokenGenerator; clock: Clock };
type Outcome = Promise<Result<Table, TableUseCaseError>>;

/** Loads a live table of the actor's restaurant, applies a domain change, and saves it. */
async function change(
  deps: Pick<Deps, "tables">,
  actor: TableActor,
  id: TableId,
  apply: (table: Table) => Result<Table, TableUseCaseError>,
): Outcome {
  const allowed = requireTablePermission(actor);
  if (!allowed.ok) return allowed;

  const table = await deps.tables.find(actor.restaurantId, id);
  if (!table || table.deletedAt) return err({ type: "NOT_FOUND" });

  const next = apply(table);
  if (!next.ok) return next;
  const saved = await deps.tables.update(next.value);
  if (saved === "LABEL_TAKEN") return err({ type: "LABEL_TAKEN" });
  // Not saved (the row vanished, or the database refused this user): never report a change that did not happen.
  return saved === "OK" ? next : err({ type: "NOT_FOUND" });
}

/** The tables of the actor's restaurant, for the owner screen and the print page. */
export function makeListTables(deps: Pick<Deps, "tables">) {
  return async (actor: TableActor): Promise<Result<Table[], TableUseCaseError>> => {
    const allowed = requireTablePermission(actor);
    return allowed.ok ? ok(await deps.tables.list(actor.restaurantId)) : allowed;
  };
}

export function makeAddTable(deps: Deps) {
  return async (actor: TableActor, input: { label: string }): Outcome => {
    const allowed = requireTablePermission(actor);
    if (!allowed.ok) return allowed;

    const table = createTable(actor.restaurantId, input.label, { newId: () => deps.ids.newId(), newToken: () => deps.tokens.newToken() }, deps.clock.now());
    if (!table.ok) return table;
    return (await deps.tables.insert(table.value)) === "OK" ? table : err({ type: "LABEL_TAKEN" });
  };
}

export const makeRenameTable = (deps: Pick<Deps, "tables">) => (actor: TableActor, input: { tableId: TableId; label: string }) =>
  change(deps, actor, input.tableId, (table) => renameTable(table, input.label));

export const makeSetTableActive = (deps: Pick<Deps, "tables">) => (actor: TableActor, input: { tableId: TableId; isActive: boolean }) =>
  change(deps, actor, input.tableId, (table) => setTableActive(table, input.isActive));

/** A new QR code for the table: the printed one stops working at once. */
export const makeRegenerateTableToken = (deps: Pick<Deps, "tables" | "tokens">) => (actor: TableActor, input: { tableId: TableId }) =>
  change(deps, actor, input.tableId, (table) => regenerateToken(table, { newToken: () => deps.tokens.newToken() }));

export const makeDeleteTable = (deps: Pick<Deps, "tables" | "clock">) => (actor: TableActor, input: { tableId: TableId }) =>
  change(deps, actor, input.tableId, (table) => deleteTable(table, deps.clock.now()));
