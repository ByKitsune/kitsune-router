const hasChatToolValue = value => value !== undefined && value !== null && value !== "";

// Null partial fields mean "not supplied yet" on compatible Chat streams.
// Do not coerce non-null malformed values or rewrite complete message snapshots.
export function normalizeChatDeltaFields(chunk) {
  const normalizeFunction = fn => {
    if (!fn || typeof fn !== "object" || Array.isArray(fn)) return;
    if (fn.name === null) delete fn.name;
    if (fn.arguments === null) delete fn.arguments;
  };
  for (const choice of Array.isArray(chunk?.choices) ? chunk.choices : []) {
    if (!choice || typeof choice !== "object" || choice.message) continue;
    if (choice.delta === null) choice.delta = {};
    const delta = choice.delta;
    if (!delta || typeof delta !== "object" || Array.isArray(delta)) continue;
    if (delta.role === null) delete delta.role;
    normalizeFunction(delta.function_call);
    for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
      if (!call || typeof call !== "object") continue;
      if (call.function === null) delete call.function;
      else normalizeFunction(call.function);
    }
  }
}

// Some Chat-compatible upstreams send index-only/null tool placeholders (#5345).
// They do not start or continue a tool and must not allocate native tool state.
// Keep partial IDs/names/arguments and opaque extension metadata untouched.
function isEmptyChatToolDelta(call) {
  if (call == null) return true;
  if (typeof call !== "object" || Array.isArray(call)) return false;
  const fn = call.function;
  if (hasChatToolValue(call.id) || hasChatToolValue(fn?.name) || hasChatToolValue(fn?.arguments)) return false;
  if (fn != null && (typeof fn !== "object" || Array.isArray(fn))) return false;
  if (hasChatToolValue(call.type) && call.type !== "function") return false;
  return Object.keys(call).every(key => ["index", "id", "type", "function"].includes(key)) &&
    Object.keys(fn || {}).every(key => key === "name" || key === "arguments");
}

export function discardEmptyChatToolDeltas(chunk) {
  if (!Array.isArray(chunk?.choices)) return;
  for (const choice of chunk.choices) {
    const delta = choice?.delta;
    const calls = delta?.tool_calls;
    if (!Array.isArray(calls) || !calls.some(isEmptyChatToolDelta)) continue;
    const retained = calls.filter(call => !isEmptyChatToolDelta(call));
    if (retained.length) delta.tool_calls = retained;
    else delete delta.tool_calls;
  }
}
import { randomUUID } from "node:crypto";
import { SSE_LIMITS } from "./sse.js";
import { OPENAI_FINISH } from "../translator/schema/finishReasons.js";


// Only ID-less Chat tools wait here. Normal provider IDs, including signed IDs,
// are never replaced. Retain fragments until a late provider ID arrives, or
// until an explicit successful finish can commit a gateway-owned client ID.
export function createChatToolIdentityBuffer({ maxBufferedChars = SSE_LIMITS.eventChars, maxBufferedFrames = SSE_LIMITS.outputItems } = {}) {
  const pending = new Map();
  const pendingChoices = new Map();
  const known = new Set();
  const terminals = new Map();
  let sequence = 0;
  let bufferedChars = 0;
  let bufferedFrames = 0;
  const hasPendingChoice = index => pendingChoices.has(index);
  const remember = key => {
    if (!known.has(key) && known.size >= SSE_LIMITS.outputItems) throw new RangeError("Upstream tool identity count exceeds limit");
    known.add(key);
  };
  const retain = frame => {
    const chars = JSON.stringify(frame).length;
    if (bufferedChars + chars > maxBufferedChars || bufferedFrames >= maxBufferedFrames) throw new RangeError("Pending upstream tool identity exceeds limit");
    bufferedChars += chars;
    bufferedFrames++;
    return { frame, chars, sequence: sequence++ };
  };
  const release = record => { bufferedChars -= record.chars; bufferedFrames--; return record; };
  const toolFrame = (chunk, choice, call) => {
    const frame = { ...chunk, choices: [{ ...choice, delta: { tool_calls: [call] }, finish_reason: null }] };
    delete frame.usage;
    return frame;
  };
  const capture = (entry, chunk, choice, call) => {
    entry.frames.push(retain(toolFrame(chunk, choice, call)));
    if (hasChatToolValue(call.id) && typeof call.id !== "string") entry.invalid = true;
    if (call.type !== undefined && call.type !== "function") entry.invalid = true;
    const fn = call.function;
    if (fn !== undefined && (!fn || typeof fn !== "object" || Array.isArray(fn))) entry.invalid = true;
    for (const [field, parts] of [["name", entry.names], ["arguments", entry.arguments]]) {
      if (fn?.[field] === undefined) continue;
      if (typeof fn[field] !== "string") entry.invalid = true;
      else parts.push(fn[field]);
    }
  };
  const replay = (key, entry, id) => {
    const records = entry.frames.map((record, index) => {
      const choice = record.frame.choices[0];
      const call = { ...choice.delta.tool_calls[0] };
      if (index === 0) call.id = id;
      else delete call.id;
      record.frame = { ...record.frame, choices: [{ ...choice, delta: { tool_calls: [call] } }] };
      return release(record);
    });
    pending.delete(key);
    const remaining = pendingChoices.get(entry.choice) - 1;
    if (remaining) pendingChoices.set(entry.choice, remaining);
    else pendingChoices.delete(entry.choice);
    remember(key);
    return records;
  };
  return {
    process(chunk) {
      if (!Array.isArray(chunk?.choices)) return [chunk];
      const ready = [];
      const completed = [];
      let changed = false;
      const choices = chunk.choices.map(choice => {
        const index = choice.index ?? 0;
        let result = choice;
        const calls = choice.delta?.tool_calls;
        if (Array.isArray(calls)) {
          const retained = [];
          for (const call of calls) {
            if (!call || typeof call !== "object" || Array.isArray(call)) throw new TypeError("Invalid upstream tool call");
            // An index-less fragment has no ownership. Leave its original
            // protocol bytes alone rather than assigning it to another tool.
            if (!Number.isSafeInteger(call.index) || call.index < 0) { retained.push(call); continue; }
            const key = `${index}:${call.index}`;
            const id = typeof call.id === "string" && call.id ? call.id : null;
            let entry = pending.get(key);
            if (entry) {
              const continuation = { ...call };
              delete continuation.id;
              if (!isEmptyChatToolDelta(continuation)) capture(entry, chunk, choice, continuation);
              if (id) ready.push(...replay(key, entry, id));
              changed = true;
            } else if (id || known.has(key)) {
              if (id) remember(key);
              retained.push(call);
            } else {
              entry = { choice: index, frames: [], names: [], arguments: [], invalid: false };
              pending.set(key, entry);
              pendingChoices.set(index, (pendingChoices.get(index) || 0) + 1);
              capture(entry, chunk, choice, call);
              changed = true;
            }
          }
          if (retained.length !== calls.length) {
            const delta = { ...choice.delta };
            if (retained.length) delta.tool_calls = retained;
            else delete delta.tool_calls;
            result = { ...choice, delta };
          }
        }
        if (choice.finish_reason && hasPendingChoice(index)) {
          if (!terminals.has(index)) {
            const frame = { ...chunk, choices: [{ ...choice, delta: {} }] };
            delete frame.usage;
            terminals.set(index, retain(frame));
          }
          result = { ...result, finish_reason: null };
          changed = true;
        } else if (!hasPendingChoice(index) && terminals.has(index)) {
          completed.push(release(terminals.get(index)));
          terminals.delete(index);
          changed = true;
        }
        return result;
      });
      ready.sort((left, right) => left.sequence - right.sequence);
      completed.sort((left, right) => left.sequence - right.sequence);
      return [...ready.map(record => record.frame), ...completed.map(record => record.frame), changed ? { ...chunk, choices } : chunk];
    },
    flushCompleted() {
      // Validate every pending call before emitting any invented identity. A
      // length/error finish or malformed JSON must remain an explicit failure.
      for (const entry of pending.values()) {
        const finish = terminals.get(entry.choice)?.frame.choices[0].finish_reason;
        if (![OPENAI_FINISH.STOP, OPENAI_FINISH.TOOL_CALLS].includes(finish) || entry.invalid || !entry.names.join("")) throw new TypeError("Upstream tool call has no complete identity");
        try { JSON.parse(entry.arguments.join("")); }
        catch { throw new TypeError("Upstream tool call arguments are incomplete"); }
      }
      const ready = [];
      for (const [key, entry] of pending) ready.push(...replay(key, entry, `call_${randomUUID()}`));
      ready.sort((left, right) => left.sequence - right.sequence);
      const completed = [...terminals.values()].sort((left, right) => left.sequence - right.sequence);
      terminals.clear();
      return [...ready.map(record => record.frame), ...completed.map(record => release(record).frame)];
    },
    hasPending: () => pending.size > 0,
    clear() { pending.clear(); pendingChoices.clear(); known.clear(); terminals.clear(); bufferedChars = 0; bufferedFrames = 0; },
  };
}
