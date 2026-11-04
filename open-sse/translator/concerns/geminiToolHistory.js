import { buildToolCallId, isLegacyThoughtSignature } from "./thoughtSignature.js";

function appendPending(index, key, call) {
  // findIndex used strict equality: NaN must never become a matching key.
  if (key !== key) return;
  const queue = index.get(key);
  if (queue) queue.calls.push(call);
  else index.set(key, { calls: [call], next: 0 });
}

function takePending(index, key) {
  const queue = index.get(key);
  if (!queue) return null;
  while (queue.next < queue.calls.length) {
    const call = queue.calls[queue.next++];
    // ID and name lookups share occurrences; either can consume a call first.
    if (call.matched) continue;
    call.matched = true;
    return call;
  }
  return null;
}

export function geminiToolHistory(contents) {
  const ids = new WeakMap();
  const used = new Set();
  const reserved = new Set();
  const pendingById = new Map();
  const pendingByName = new Map();
  const nextSuffixByBase = new Map();
  for (const content of contents || []) {
    for (const part of content.parts || []) if (part.functionCall?.id) reserved.add(part.functionCall.id);
  }
  let index = 0;
  for (const content of contents || []) {
    for (const part of content.parts || []) {
      const call = part.functionCall;
      if (call) {
        const base = call.id || `call_${call.name}`;
        let rawId = base;
        let suffix = nextSuffixByBase.get(base) || 2;
        while (!call.id && (used.has(rawId) || reserved.has(rawId))) rawId = `${base}_d${suffix++}`;
        if (!call.id) nextSuffixByBase.set(base, suffix);
        used.add(rawId);
        const signature = part.thoughtSignature ?? part.thought_signature ?? call.thoughtSignature ?? "";
        const id = buildToolCallId(call.name, index++, isLegacyThoughtSignature(signature) ? "" : signature, rawId);
        ids.set(part, id);
        const pending = { id, matched: false };
        appendPending(pendingById, call.id, pending);
        appendPending(pendingByName, call.name, pending);
      }
      const response = part.functionResponse;
      if (response) {
        const responseId = response.id;
        const match = responseId ? takePending(pendingById, responseId) : takePending(pendingByName, response.name);
        ids.set(part, match ? match.id : responseId || `call_${response.name}`);
      }
    }
  }
  return ids;
}
