// Require a complete green Vitest report. Collection/runner failures and empty
// discovery must never become "no regression" merely because no assertion ran.
// Usage: node tests/__baseline__/verify-no-regression.mjs <current-results.json>
import { readFileSync } from "fs";

const resultsPath = process.argv[2];
if (!resultsPath) { console.error("Missing results.json path"); process.exit(2); }

const r = JSON.parse(readFileSync(resultsPath, "utf8"));
const files = Array.isArray(r.testResults) ? r.testResults : [];
const assertions = files.flatMap(file => file.assertionResults || []);
const failedFiles = files.filter(file => file.status === "failed" || file.message);
const passed = assertions.filter(test => test.status === "passed").length;
const failed = assertions.filter(test => test.status === "failed");
const skipped = assertions.filter(test => ["skipped", "pending", "todo"].includes(test.status)).length;
const errors = [];
if (r.success !== true) errors.push("runner did not report success");
if (r.numFailedTestSuites !== 0 || failedFiles.length) errors.push("failed or incomplete suite collection");
if (r.numFailedTests !== 0 || failed.length) errors.push("failed test assertions");
if (!files.length || !passed) errors.push("no passing tests were discovered");
if (assertions.length !== r.numTotalTests || passed !== r.numPassedTests ||
    passed + failed.length + skipped !== assertions.length ||
    skipped !== (r.numPendingTests || 0) + (r.numTodoTests || 0)) {
  errors.push("test results do not match the summary counts");
}
if (errors.length) {
  console.error(`Verification failed: ${errors.join("; ")}`);
  for (const file of failedFiles) console.error(`  suite: ${file.name}`);
  for (const test of failed) console.error(`  test: ${test.fullName}`);
  process.exit(1);
}
console.log(`No regression: ${passed} passed, ${skipped} skipped/todo, ${files.length} files, zero failed suites.`);
