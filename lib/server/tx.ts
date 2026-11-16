import type { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

/**
 * Runs fn in a write transaction; any thrown error rolls everything back.
 * Inside an existing transaction it simply joins it (the outer one commits or rolls back).
 */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("begin immediate");
  try {
    const result = fn();
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
