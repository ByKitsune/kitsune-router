import { canonicalUsageTimestamp } from "../helpers/usageTimestamp.js";

const BATCH_SIZE = 500;

export default {
  version: 3,
  name: "canonical-usage-timestamps",
  up(db) {
    if (!db.all("PRAGMA table_info(usageHistory)").some(column => column.name === "sourceTimestamp")) {
      db.exec("ALTER TABLE usageHistory ADD COLUMN sourceTimestamp TEXT");
    }
    let afterId = null;
    for (;;) {
      // Keyset pages bound row memory without rescanning prior IDs. Oversized
      // malformed values remain stored but do not enter the JS batch payload.
      const rows = db.all(
        `SELECT id, CASE WHEN length(timestamp) <= 128 THEN timestamp ELSE NULL END AS timestamp FROM usageHistory${afterId === null ? "" : " WHERE id > ?"} ORDER BY id LIMIT ?`,
        afterId === null ? [BATCH_SIZE] : [afterId, BATCH_SIZE]
      );
      if (!rows.length) break;
      for (const row of rows) {
        const canonical = canonicalUsageTimestamp(row.timestamp);
        if (canonical !== null && canonical !== row.timestamp) {
          db.run("UPDATE usageHistory SET timestamp = ?, sourceTimestamp = COALESCE(sourceTimestamp, ?) WHERE id = ?", [canonical, row.timestamp, row.id]);
        }
      }
      afterId = rows[rows.length - 1].id;
    }
  },
};
