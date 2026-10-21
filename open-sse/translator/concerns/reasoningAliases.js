import { ROLE } from "../schema/index.js";

// PR #4870 6a9775e6097fc81c7a9a1986a2c055ee6d0573b5 and
// PR #4881 8b0ab9a5a3eb68e8797d8b9d404704ceb54c9e13 describe a serde
// alias collision, not duplicate JSON keys. Only lossless readable aliases can
// be reconciled; structured/contradictory carriers need an explicit diagnostic.
export function normalizeChatReasoningAliases(body) {
  if (!Array.isArray(body?.messages) || Object.hasOwn(body, "input")) return body;
  let changed = false;
  const messages = body.messages.map((message, index) => {
    if (message?.role !== ROLE.ASSISTANT) return message;
    const canonical = message.reasoning_content;
    const alias = message.reasoning;
    let param;
    if (canonical != null && typeof canonical !== "string") param = "reasoning_content";
    else if (alias != null && typeof alias !== "string") param = "reasoning";
    else if (canonical && alias && canonical !== alias) param = "reasoning";
    if (param) {
      const error = new Error("unsupported_parameter: Assistant Chat reasoning carriers must be readable text and agree when both aliases are supplied; resend a single supported reasoning_content value.");
      error.code = "unsupported_parameter";
      error.param = `messages.${index}.${param}`;
      throw error;
    }
    if (!Object.hasOwn(message, "reasoning")) return message;
    changed = true;
    const { reasoning, ...normalized } = message;
    if (!canonical && alias) normalized.reasoning_content = alias;
    return normalized;
  });
  return changed ? { ...body, messages } : body;
}
