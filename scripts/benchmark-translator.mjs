import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const options = { iterations: 60, parallelTools: 400, output: null, baselineRef: null };
const flags = { "--iterations": "iterations", "--parallel-tools": "parallelTools", "--output": "output", "--baseline-ref": "baselineRef" };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const option = flags[args[index]];
  if (!option || !args[index + 1]) throw new Error("Usage: node scripts/benchmark-translator.mjs [--iterations N] [--parallel-tools N] [--baseline-ref REF] [--output FILE]");
  options[option] = args[++index];
}
const iterations = Number(options.iterations);
const parallel = Number(options.parallelTools);
if (!Number.isInteger(iterations) || iterations < 10 || iterations > 10000) throw new Error("iterations must be an integer from 10 to 10000");
if (!Number.isInteger(parallel) || parallel < 1 || parallel > 5000) throw new Error("parallel-tools must be an integer from 1 to 5000");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const baselineCommit = options.baselineRef ? git("rev-parse", "--verify", "--end-of-options", `${options.baselineRef}^{commit}`) : null;
const baselinePaths = ["open-sse/translator/concerns/toolCall.js", "open-sse/translator/formats/claude.js"];
const snapshots = new Map(baselineCommit ? baselinePaths.map(path => [pathToFileURL(resolve(root, path)).href, git("show", `${baselineCommit}:${path}`)]) : []);
globalThis.fetch = async () => { throw new Error("Translator benchmark forbids network requests"); };

// Synthetic, local CPU work only. Keep the real translator and SSE pipeline;
// replace only persistence effects, never fetch provider endpoints.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/usageDb.js") return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export function trackPendingRequest(){};export async function appendRequestLog(){};export async function saveRequestUsage(){}") };
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  if (snapshots.has(url)) return { format: "module", shortCircuit: true, source: snapshots.get(url) };
  return nextLoad(url, context);
} });
const { translateRequest } = await import(pathToFileURL(root + "open-sse/translator/index.js"));
const { createSSEStream } = await import(pathToFileURL(root + "open-sse/utils/stream.js"));
const { FORMATS: F } = await import(pathToFileURL(root + "open-sse/translator/formats.js"));
const encoder = new TextEncoder();
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const summary = values => {
  values.sort((a, b) => a - b);
  return { p50_ms: values[Math.floor(values.length * .5)], p95_ms: values[Math.min(values.length - 1, Math.floor(values.length * .95))] };
};
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const tools = [{ type: "function", function: { name: "inspect", description: "Inspect one record", parameters: { type: "object", properties: { index: { type: "integer" } }, required: ["index"] } } }];
const chat = count => ({ model: "fixture", max_tokens: 4096, tools, messages: count ? [
  { role: "system", content: "Preserve the protocol and exact tool identifiers." },
  { role: "user", content: "Inspect the records and screenshot." },
  { role: "assistant", content: null, tool_calls: Array.from({ length: count }, (_, i) => ({ id: `call_${i}`, type: "function", function: { name: "inspect", arguments: JSON.stringify({ index: i }) } })) },
  ...Array.from({ length: count }, (_, i) => ({ role: "tool", tool_call_id: `call_${count - i - 1}`, content: `record:${count - i - 1}:` + "x".repeat(256) })),
  { role: "user", content: [{ type: "text", text: "Describe what changed." }, { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] },
] : [{ role: "user", content: "Hello, return first-token." }] });
const convert = (from, to, body, model, provider) => translateRequest(from, to, model, body, true, { projectId: "fixture-project", connectionId: "fixture-connection" }, provider);
const fixtures = [];
for (const [size, count] of [["normal", 0], ["parallel-tools-media", parallel]]) {
  const original = chat(count);
  const claude = convert(F.OPENAI, F.CLAUDE, original, "claude-sonnet-4-6", "claude");
  const gemini = convert(F.OPENAI, F.GEMINI, original, "gemini-2.5-flash", "gemini");
  const responses = convert(F.OPENAI, F.OPENAI_RESPONSES, original, "gpt-4.1", "openai");
  for (const [name, source, target, body, model, provider] of [
    ["chat-to-claude", F.OPENAI, F.CLAUDE, original, "claude-sonnet-4-6", "claude"],
    ["claude-to-chat", F.CLAUDE, F.OPENAI, claude, "gpt-4.1", "openai"],
    ["chat-to-gemini", F.OPENAI, F.GEMINI, original, "gemini-2.5-flash", "gemini"],
    ["gemini-to-chat", F.GEMINI, F.OPENAI, gemini, "gpt-4.1", "openai"],
    ["chat-to-responses", F.OPENAI, F.OPENAI_RESPONSES, original, "gpt-4.1", "openai"],
    ["responses-to-claude", F.OPENAI_RESPONSES, F.CLAUDE, responses, "claude-sonnet-4-6", "claude"],
  ]) fixtures.push({ name: `${name}/${size}`, source, target, body, model, provider });
}

function frame(target) {
  if (target === F.CLAUDE) return 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_fixture","type":"message","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"first-token"}}\n\n';
  if (target === F.GEMINI) return 'data: {"candidates":[{"index":0,"content":{"role":"model","parts":[{"text":"first-token"}]}}]}\n\n';
  if (target === F.OPENAI_RESPONSES) return 'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_fixture","model":"fixture"}}\n\nevent: response.output_text.delta\ndata: {"type":"response.output_text.delta","item_id":"msg_fixture","output_index":0,"content_index":0,"delta":"first-token"}\n\n';
  return 'data: {"id":"chatcmpl-fixture","model":"fixture","choices":[{"index":0,"delta":{"role":"assistant","content":"first-token"},"finish_reason":null}]}\n\n';
}
async function firstEvent(fixture) {
  const started = performance.now();
  const wire = convert(fixture.source, fixture.target, fixture.body, fixture.model, fixture.provider);
  JSON.stringify(wire); // include the executor's unavoidable wire serialization
  let controller;
  const source = new ReadableStream({ start(value) { controller = value; } });
  const transformed = createSSEStream({ sourceFormat: fixture.source, targetFormat: fixture.target, provider: fixture.provider, model: fixture.model });
  const reader = source.pipeThrough(transformed).getReader();
  controller.enqueue(encoder.encode(frame(fixture.target)));
  const decoder = new TextDecoder();
  let received = "";
  while (!received.includes("first-token")) {
    const item = await reader.read();
    if (item.done) throw new Error("Stream ended before semantic content");
    received += decoder.decode(item.value, { stream: true });
  }
  const duration = performance.now() - started;
  await reader.cancel("synthetic benchmark completed");
  reader.releaseLock();
  return duration;
}

const results = [];
for (const fixture of fixtures) {
  const inputHash = hash(fixture.body);
  for (let i = 0; i < 15; i++) convert(fixture.source, fixture.target, fixture.body, fixture.model, fixture.provider);
  const translate = [];
  const first = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    convert(fixture.source, fixture.target, fixture.body, fixture.model, fixture.provider);
    translate.push(performance.now() - start);
  }
  for (let i = 0; i < 5; i++) await firstEvent(fixture);
  for (let i = 0; i < Math.min(iterations, 30); i++) first.push(await firstEvent(fixture));
  if (inputHash !== hash(fixture.body)) throw new Error("Borrowed fixture mutated: " + fixture.name);
  const wire = convert(fixture.source, fixture.target, fixture.body, fixture.model, fixture.provider);
  results.push({ fixture: fixture.name, input_sha256: inputHash, output_sha256: hash(wire), input_bytes: JSON.stringify(fixture.body).length, translate: summary(translate), request_serialization_and_first_semantic_event: summary(first) });
}
const report = {
  node: process.version,
  source_commit: git("rev-parse", "HEAD"),
  source_worktree_dirty: git("status", "--porcelain", "--untracked-files=no").length > 0,
  baseline_commit: baselineCommit,
  baseline_paths: baselineCommit ? baselinePaths : [],
  iterations,
  first_event_iterations: Math.min(iterations, 30),
  parallel_tools: parallel,
  fixture_sha256: hash(fixtures),
  scope: "Synthetic local CPU; translation + serialization + real SSE to first semantic event; persistence stubbed, network forbidden, no provider/account latency",
  results,
};
if (options.output) writeFileSync(resolve(options.output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
