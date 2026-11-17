// Query shapes can vary with filters and placeholder counts. Retain a bounded
// working set rather than keeping every prepared statement for the process life.
const MAX_STATEMENTS = 256;

export function createStatementCache(database) {
  const statements = new Map();
  return {
    prepare(sql) {
      let statement = statements.get(sql);
      if (statement) {
        statements.delete(sql);
      } else {
        statement = database.prepare(sql);
      }
      statements.set(sql, statement);
      if (statements.size > MAX_STATEMENTS) {
        const oldest = statements.keys().next().value;
        const evicted = statements.get(oldest);
        statements.delete(oldest);
        // Bun exposes explicit finalization. Node and better-sqlite3 release
        // native statements when the removed references are garbage-collected.
        evicted.finalize?.();
      }
      return statement;
    },
    clear() {
      for (const statement of statements.values()) statement.finalize?.();
      statements.clear();
    },
  };
}
