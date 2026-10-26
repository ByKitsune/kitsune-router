import { buildToolCallId } from "./thoughtSignature.js";

export function geminiToolHistory(contents) {
  const ids = new WeakMap();
  const used = new Set();
  const reserved = new Set();
  const pending = [];
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
        let suffix = 2;
        while (used.has(rawId) || (rawId !== call.id && reserved.has(rawId))) rawId = `${base}_d${suffix++}`;
        used.add(rawId);
        const signature = part.thoughtSignature ?? part.thought_signature ?? call.thoughtSignature ?? "";
        const id = buildToolCallId(call.name, index++, signature, rawId);
        ids.set(part, id);
        pending.push({ id, rawId: call.id, name: call.name });
      }
      const response = part.functionResponse;
      if (response) {
        const match = pending.findIndex(call => response.id ? call.rawId === response.id : call.name === response.name);
        if (match >= 0) ids.set(part, pending.splice(match, 1)[0].id);
        else ids.set(part, response.id || `call_${response.name}`);
      }
    }
  }
  return ids;
}
