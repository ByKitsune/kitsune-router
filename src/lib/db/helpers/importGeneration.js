// Shared by DB-derived caches without importing an API route or loading its code.
// Advance only after the SQLite transaction commits successfully.
const key = Symbol.for("zenrouter.db.importState");
const state = globalThis[key] ||= { generation: 0 };

export function getDbImportGeneration() {
  return state.generation;
}

export function advanceDbImportGeneration() {
  state.generation++;
}
