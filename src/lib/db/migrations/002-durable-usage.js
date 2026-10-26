import { TABLES, buildCreateTableSql } from "../schema.js";
import { installConfigRevisionTriggers } from "../helpers/configTriggers.js";

export default {
  version: 2,
  name: "durable-usage-and-runtime",
  up(db) {
    if (!db.all("PRAGMA table_info(usageHistory)").some(column => column.name === "eventId")) {
      db.exec("ALTER TABLE usageHistory ADD COLUMN eventId TEXT");
    }
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uh_event ON usageHistory(eventId)");
    const index = db.all("PRAGMA index_list(usageHistory)").find(row => row.name === "idx_uh_event");
    const columns = db.all("PRAGMA index_info(idx_uh_event)");
    if (Number(index?.unique) !== 1 || Number(index?.partial || 0) !== 0 || columns.length !== 1 || columns[0].name !== "eventId") {
      throw new Error("[DB] usage event uniqueness is not enforced");
    }
    for (const name of ["connectionRuntime", "usageOutbox"]) {
      db.exec(buildCreateTableSql(name, TABLES[name]));
      for (const sql of TABLES[name].indexes || []) db.exec(sql);
    }
    installConfigRevisionTriggers(db);
    db.exec(`INSERT INTO _meta(key, value) SELECT 'usageOutboxDepth', CAST(COUNT(*) AS TEXT) FROM usageOutbox WHERE 1 ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      INSERT INTO _meta(key, value) SELECT 'usageOutboxBytes', CAST(COALESCE(SUM(bytes), 0) AS TEXT) FROM usageOutbox WHERE 1 ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      CREATE TRIGGER IF NOT EXISTS usage_outbox_accept AFTER INSERT ON usageOutbox BEGIN
        UPDATE _meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'usageOutboxDepth';
        UPDATE _meta SET value = CAST(value AS INTEGER) + NEW.bytes WHERE key = 'usageOutboxBytes';
      END;
      CREATE TRIGGER IF NOT EXISTS usage_outbox_project AFTER DELETE ON usageOutbox BEGIN
        UPDATE _meta SET value = CAST(value AS INTEGER) - 1 WHERE key = 'usageOutboxDepth';
        UPDATE _meta SET value = CAST(value AS INTEGER) - OLD.bytes WHERE key = 'usageOutboxBytes';
      END;`);
  },
};
