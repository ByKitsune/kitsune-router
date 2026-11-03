import dataDirectory from "../../cli/hooks/dataDirectory.js";

export function getDataDir() {
  // An unavailable explicit directory must fail closed at the DB permission
  // gate, never fall back to a fresh database and hide the user's accounts.
  return dataDirectory.resolveDataDirectory();
}

export const DATA_DIR = getDataDir();
