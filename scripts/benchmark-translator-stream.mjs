import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Session } from "node:inspector";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const flags = {};
const allowed = new Set(["iterations", "parallel-tools", "baseline-ref", "output", "only", "allocation-profile"]);
for (let index = 2; index < process.argv.length; index++) {
  const [name, ...inline] = process.argv[index].replace(/^--/, "").split("=");
  if (!allowed.has(name)) throw new Error(`Unknown option: ${name}`);
  const value = inline.length ? inline.join("=") : process.argv[++index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  flags[name] = value;
}
const iterations = Number(flags.iterations || 15);
const parallel = Number(flags["parallel-tools"] || 128);
if (!Number.isInteger(iterations) || iterations < 3 || iterations > 2000) throw new Error("iterations must be an integer from 3 to 2000");
if (!Number.isInteger(parallel) || parallel < 1 || parallel > 1024) throw new Error("parallel-tools must be an integer from 1 to 1024");
const only = flags.only || null;
const gitRaw = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const git = (...args) => gitRaw(...args).trim();
const baseline = flags["baseline-ref"] ? git("rev-parse", "--verify", "--end-of-options", `${flags["baseline-ref"]}^{commit}`) : null;
const enginePrefix = pathToFileURL(resolve(root, "open-sse")).href + "/";
const loadedSources = new Map();
// Keep every open-sse dependency coherent when comparing a historical engine.
// Only persistence is stubbed. All workloads call local translation/stream APIs;
// no providers, credentials, proxy settings or global network APIs are used.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/usageDb.js") return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export function trackPendingRequest(){};export async function appendRequestLog(){};export async function saveRequestUsage(){};export async function enqueueRequestUsage(){return {accepted:true}};") };
    if (specifier.startsWith("@/")) return next(pathToFileURL(resolve(root, "src", specifier.slice(2))).href, context);
    if (specifier.startsWith("open-sse/")) return next(pathToFileURL(resolve(root, specifier)).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(enginePrefix) && /\.m?js$/.test(url)) {
      const path = relative(root, fileURLToPath(url));
      const source = baseline ? gitRaw("show", `${baseline}:${path}`) : readFileSync(fileURLToPath(url), "utf8");
      loadedSources.set(path, source);
      return { shortCircuit: true, format: "module", source };
    }
    return next(url, context);
  },
});
const { createSSEParser } = await import(pathToFileURL(`${root}/open-sse/utils/sse.js`));
const { createSSEStream } = await import(pathToFileURL(`${root}/open-sse/utils/stream.js`));
const { initState, translateResponse } = await import(pathToFileURL(`${root}/open-sse/translator/index.js`));
const { FORMATS: F } = await import(pathToFileURL(`${root}/open-sse/translator/formats.js`));
const { createStreamController, createDisconnectAwareStream } = await import(pathToFileURL(`${root}/open-sse/utils/streamHandler.js`));
const encoder = new TextEncoder();
const sha = value => createHash("sha256").update(value).digest("hex");
const frame = (content, extra = {}) => `data: ${JSON.stringify({ id: "chatcmpl-stream-perf", created: 1700000000, model: "fixture", choices: [{ index: 0, delta: { content }, finish_reason: null }], ...extra })}\n\n`;
const arg = "opaque tool input 世界 ".repeat(32768);
const argument = `event: response.function_call_arguments.delta\r\ndata: ${JSON.stringify({ type: "response.function_call_arguments.delta", item_id: "fc_fixture", output_index: 0, delta: arg })}\r\n\r\n`;
const terminal = 'data: {"id":"chatcmpl-stream-perf","created":1700000000,"model":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}\n\ndata: [DONE]\n\n';
const tokens = Array.from({ length: 2048 }, (_, index) => frame(index ? `text ${index} 世界` : "first-semantic-世界")).join("");
const hugeEvent = frame("opaque image bytes ".repeat(65536));
const cases = [];
for (const [name, wire, sizes] of [["argument", argument, [7, 1024, 65536]], ["tokens", tokens, [17, 4096, 65536]], ["huge-event", hugeEvent, [65536]]]) {
  const bytes = encoder.encode(wire);
  for (const fragment of sizes) cases.push({ name: `parser/${name}/${fragment}`, bytes, fragment, kind: "parser" });
}
const tiny = encoder.encode(frame("world 世界".repeat(4096)));
cases.push({ name: "parser/one-byte/1", bytes: tiny, fragment: 1, kind: "parser", iterations: Math.max(5, Math.floor(iterations / 3)) });
const tokenBytes = encoder.encode(tokens + terminal);
for (const fragment of [17, 4096, 65536]) cases.push({ name: `pipeline/tokens/${fragment}`, bytes: tokenBytes, fragment, kind: "pipeline", semanticMarker: "first-semantic-世界" });
const bigBytes = encoder.encode(hugeEvent.repeat(4));
cases.push({ name: "boundary/large-utf8/1048576", bytes: bigBytes, fragment: 1048576, kind: "boundary" });
// Parallel calls open before their interleaved, exact argument fragments. The
// first ID carries a synthetic opaque Google signature; it is never fabricated
// by production code and must remain unchanged through native lowering.
const signature = Buffer.from("request-local opaque fixture").toString("base64");
const calls = Array.from({ length: parallel }, (_, index) => ({
  id: index ? `call_${index}` : `call_0_TSIG_${Buffer.from(signature).toString("base64url")}`,
  name: "inspect_first_semantic", arguments: JSON.stringify({ index, created: 42, payload: "x".repeat(2048) }),
}));
const toolChunk = (tool_calls, finish_reason = null, usage) => ({ id: "chatcmpl-stream-perf", created: 1700000000, model: "fixture",
  choices: [{ index: 0, delta: tool_calls ? { tool_calls } : {}, finish_reason }], ...(usage ? { usage } : {}) });
const toolEvents = calls.map((call, index) => toolChunk([{ index, id: call.id, type: "function", function: { name: call.name, arguments: "" } }]));
for (let offset = 0; offset < Math.max(...calls.map(call => call.arguments.length)); offset += 32) {
  for (const [index, call] of calls.entries()) if (offset < call.arguments.length) toolEvents.push(toolChunk([{ index, function: { arguments: call.arguments.slice(offset, offset + 32) } }]));
}
toolEvents.push(toolChunk(null, "tool_calls", { prompt_tokens: 31, completion_tokens: 19, total_tokens: 50 }));
for (const target of [F.CLAUDE, F.GEMINI, F.OPENAI_RESPONSES]) cases.push({ name: `response/parallel-tools/${target}`, kind: "response", events: toolEvents, target });
const toolBytes = encoder.encode(toolEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
for (const fragment of [64, 4096, 65536]) cases.push({ name: `pipeline/parallel-tools/claude/${fragment}`, bytes: toolBytes,
  fragment, kind: "pipeline", target: F.OPENAI, source: F.CLAUDE, semanticMarker: "inspect_first_semantic", tools: calls });
const nativeEvents = [
  { type: "message_start", message: { id: "msg_fixture", type: "message", model: "fixture", role: "assistant", content: [], usage: { input_tokens: 7, output_tokens: 0 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "opaque-original-signature+/=" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "first-semantic-世界" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "opaque-original-signature+/=" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }, { type: "message_stop" },
];
const nativeBytes = encoder.encode("id: metadata-only\nevent: ignored\nretry: 1\n\n" + nativeEvents.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(""));
for (const fragment of [1, 7, 4096]) cases.push({ name: `pipeline/native-claude/${fragment}`, bytes: nativeBytes,
  fragment, kind: "pipeline", source: F.CLAUDE, target: F.CLAUDE, semanticMarker: "first-semantic-世界" });
// Normalize only protocol timestamp fields, never similarly named fields inside
// tool arguments, opaque blocks, signatures or arbitrary application metadata.
function normalizedProtocol(value) {
  if (Array.isArray(value)) return value.map(normalizedProtocol);
  if (!value || typeof value !== "object") return value;
  const copy = { ...value };
  if (copy.object === "chat.completion.chunk" && typeof copy.created === "number") copy.created = 0;
  if (copy.object === "response" && typeof copy.created_at === "number") copy.created_at = 0;
  if (typeof copy.event === "string" && copy.data && typeof copy.data === "object") copy.data = normalizedProtocol(copy.data);
  if (copy.response?.object === "response") copy.response = normalizedProtocol(copy.response);
  return copy;
}
const digest = value => sha(JSON.stringify(normalizedProtocol(value)));
function response(fixture, capture = false) {
  const state = initState(fixture.target);
  state.declaredToolNames = new Set(["inspect_first_semantic"]);
  const output = [];
  let count = 0;
  for (const event of [...fixture.events, null]) {
    const translated = translateResponse(F.OPENAI, fixture.target, event, state);
    count += translated.length;
    if (capture) output.push(...translated);
  }
  if (capture && fixture.target === F.CLAUDE) {
    const lowered = new Map();
    for (const event of output) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        assert(!lowered.has(event.index)); lowered.set(event.index, { ...event.content_block, arguments: [] });
      }
      if (event.delta?.type === "input_json_delta") lowered.get(event.index).arguments.push(event.delta.partial_json);
    }
    assert.equal(lowered.size, calls.length);
    for (const [index, call] of lowered) { assert.equal(call.id, calls[index].id); assert.equal(call.name, calls[index].name); assert.equal(call.arguments.join(""), calls[index].arguments); }
    assert.equal(output.filter(event => event.type === "message_stop").length, 1);
  }
  return { count, digest: capture ? digest(output) : undefined };
}
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
function parse(fixture, digest = false) {
  const parser = createSSEParser();
  const hash = digest ? createHash("sha256") : null;
  let count = 0;
  for (let i = 0; i < fixture.bytes.length; i += fixture.fragment) for (const event of parser.feed(fixture.bytes.subarray(i, i + fixture.fragment))) { count++; hash?.update(JSON.stringify(event)); }
  for (const event of parser.end()) { count++; hash?.update(JSON.stringify(event)); }
  return { count, digest: hash?.digest("hex"), stats: parser.getStats() };
}
async function stream(fixture, digest = false) {
  let index = 0;
  let accepted = 0;
  let completion;
  let completeUsage;
  let firstSemantic;
  let semanticBeforeLastChunk;
  const input = new ReadableStream({ pull(controller) {
    if (index === fixture.bytes.length) { controller.close(); return; }
    const end = Math.min(index + fixture.fragment, fixture.bytes.length);
    controller.enqueue(fixture.bytes.subarray(index, end)); index = end;
  } }, { highWaterMark: 0 });
  const output = fixture.kind === "boundary" ? createDisconnectAwareStream({ readable: input }, createStreamController(), null, 0)
    : input.pipeThrough(createSSEStream({ sourceFormat: fixture.source || F.OPENAI, targetFormat: fixture.target || F.OPENAI,
      body: fixture.tools ? { tools: [{ type: "function", function: { name: "inspect_first_semantic" } }] } : null,
      onStreamComplete(value, usage, _ttft, metadata) { accepted++; completion = value; completeUsage = usage; assert.equal(metadata.failed, false); },
    }));
  const reader = output.getReader();
  const hash = digest ? createHash("sha256") : null;
  let first;
  let count = 0;
  let size = 0;
  const start = performance.now();
  for (;;) { const item = await reader.read(); if (item.done) break; first ??= performance.now() - start;
    if (firstSemantic === undefined && fixture.semanticMarker && new TextDecoder().decode(item.value).includes(fixture.semanticMarker)) {
      firstSemantic = performance.now() - start; semanticBeforeLastChunk = index < fixture.bytes.length;
    }
    count++; size += item.value.byteLength; hash?.update(item.value); }
  reader.releaseLock();
  if (fixture.kind === "pipeline") {
    assert.equal(accepted, 1);
    assert.equal(completeUsage.prompt_tokens, fixture.tools ? 31 : 7);
    assert.equal(completeUsage.completion_tokens, fixture.tools ? 19 : 3);
    if (fixture.tools) { assert.equal(completion.toolCalls.length, calls.length); for (const [index, call] of completion.toolCalls.entries()) { assert.equal(call.id, calls[index].id); assert.equal(call.arguments, calls[index].arguments); } }
    if (fixture.bytes.length > fixture.fragment * 4) assert.equal(semanticBeforeLastChunk, true);
  }
  return { count, size, accepted, first_ms: first, first_semantic_ms: firstSemantic, semantic_before_last_input_chunk: semanticBeforeLastChunk,
    completion_digest: captureCompletion(completion), digest: hash?.digest("hex") };
  function captureCompletion(value) { return digest && value ? sha(JSON.stringify({ value, usage: completeUsage })) : undefined; }
}
const results = [];
const selected = cases.filter(fixture => !only || fixture.name.includes(only));
if (!selected.length) throw new Error("No streaming workloads match --only");
for (const fixture of selected) {
  const run = fixture.kind === "parser" ? parse : fixture.kind === "response" ? response : stream;
  const expected = await run(fixture, true);
  for (let i = 0; i < 5; i++) await run(fixture);
  const times = [];
  const cpu = [];
  const first = [];
  const semantic = [];
  let measured;
  const runs = fixture.iterations || iterations;
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const inspector = flags["allocation-profile"] ? new Session() : null;
  const post = (method, params) => new Promise((resolve, reject) => inspector.post(method, params, (error, value) => error ? reject(error) : resolve(value)));
  if (inspector) { inspector.connect(); await post("HeapProfiler.startSampling", { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  for (let i = 0; i < runs; i++) {
    const previousCPU = process.cpuUsage(); const start = performance.now();
    measured = await run(fixture); times.push(performance.now() - start);
    const usage = process.cpuUsage(previousCPU); cpu.push((usage.user + usage.system) / 1000);
    if (measured.first_ms !== undefined) first.push(measured.first_ms);
    if (measured.first_semantic_ms !== undefined) semantic.push(measured.first_semantic_ms);
    if (measured.count !== expected.count || measured.size !== expected.size || measured.accepted !== expected.accepted) throw new Error(`Fidelity mismatch ${fixture.name}`);
  }
  const heapGrowth = process.memoryUsage().heapUsed - heapBefore;
  if (inspector) { const profile = await post("HeapProfiler.stopSampling", {}); writeFileSync(String(flags["allocation-profile"]), JSON.stringify(profile, null, 2) + "\n"); inspector.disconnect(); }
  const verified = await run(fixture, true);
  if (expected.digest !== verified.digest || expected.completion_digest !== verified.completion_digest) throw new Error(`Nondeterministic output ${fixture.name}`);
  results.push({ name: fixture.name, bytes: fixture.bytes?.length, input_events: fixture.events?.length, fixture_sha256: fixture.bytes ? sha(fixture.bytes) : sha(JSON.stringify(fixture.events)), iterations: runs,
    output_sha256: expected.digest, completion_sha256: expected.completion_digest, first_semantic_before_last_input_chunk: expected.semantic_before_last_input_chunk, output_events_or_chunks: expected.count, output_bytes: expected.size, accounting_calls: expected.accepted,
    p50_ms: quantile(times, .5), p95_ms: quantile(times, .95), cpu_p50_ms: quantile(cpu, .5), cpu_p95_ms: quantile(cpu, .95),
    first_chunk_p50_ms: first.length ? quantile(first, .5) : null, first_semantic_p50_ms: semantic.length ? quantile(semantic, .5) : null, heap_growth_bytes_before_gc: heapGrowth, stats: measured.stats });
}
const report = { node: process.version, commit: git("rev-parse", "HEAD"), worktree_dirty: Boolean(git("status", "--porcelain", "--untracked-files=no")), baseline_commit: baseline,
  scope: "Synthetic local CPU; public response registry and real SSE pipeline; no provider/account/network latency; persistence stubbed",
  normalization: "Only protocol Chat created and Responses created_at timestamps are ignored by response payload hashes; wire bytes and completion/argument hashes are exact",
  source_sha256: Object.fromEntries([...loadedSources].map(([path, source]) => [path, sha(source)])), results };
if (flags.output) writeFileSync(resolve(flags.output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
