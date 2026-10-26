const path = require("path");
const { resolveDataDirectory } = require("../../cli/hooks/dataDirectory");

const DATA_DIR = resolveDataDirectory();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
