/**
 * OpenAI → CommandCode request translator
 *
 * Upstream `/alpha/generate` schema (verified live with curl 2026-05-07):
 *  - params.system: STRING at top level (Anthropic-style; system messages NOT allowed in messages[])
 *  - params.messages[*].role ∈ {"user","assistant","tool"}
 *  - params.messages[*].content: Array of content blocks (NEVER a string)
 *  - tool_use blocks (assistant): {type:"tool-call", toolCallId, toolName, input}
 *  - tool_result blocks (role=user): {type:"tool-result", toolCallId, toolName, output}
 *  - tools[*]: Anthropic plain {name, description, input_schema}
 */
import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { readOutputTokenCap } from "../formats/maxTokens.js";
import { ROLE, OPENAI_BLOCK, TOOL_ERROR_PREFIX } from "../schema/index.js";
import { DEFAULT_MAX_TOKENS, COMMANDCODE_MAX_OUTPUT_TOKENS } from "../../config/runtimeConfig.js";
import { COMMAND_CODE_WORKING_DIR, createCommandCodeSessionId } from "../../shared/commandCodeHeaders.js";
import { parseDataUri } from "../concerns/image.js";
import { expandToolResultMessages } from "../concerns/toolCall.js";
import { splitToolResultContent } from "../concerns/multimodal.js";

function flattenText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const p of content) {
      if (typeof p === "string") parts.push(p);
      else if (p && typeof p === "object" && typeof p.text === "string") parts.push(p.text);
    }
    return parts.join("\n");
  }
  return String(content);
}

// OpenAI image block -> CommandCode (Anthropic-style) image block.
// Accepts OpenAI `image_url` ({url}) and AI SDK `image` ({image}) shapes.
// Returns null when the URL is neither an inline data URI nor a fetchable
// http(s) URL, so callers can fall back to a placeholder.
function toImageBlock(part) {
  const raw = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
  const url = raw || part.source?.url || (typeof part.image === "string" ? part.image : part.image?.url) || part.url || "";
  const parsed = parseDataUri(url);
  if (parsed) {
    return {
      type: OPENAI_BLOCK.IMAGE,
      source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 },
    };
  }
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    return { type: OPENAI_BLOCK.IMAGE, source: { type: "url", url } };
  }
  return null;
}

function toContentBlocks(content) {
  if (content == null) return [{ type: OPENAI_BLOCK.TEXT, text: "" }];
  if (typeof content === "string") return [{ type: OPENAI_BLOCK.TEXT, text: content }];
  if (Array.isArray(content)) {
    const blocks = [];
    for (const part of content) {
      if (typeof part === "string") {
        blocks.push({ type: OPENAI_BLOCK.TEXT, text: part });
      } else if (part && typeof part === "object") {
        if (part.type === OPENAI_BLOCK.TEXT && typeof part.text === "string") {
          blocks.push({ type: OPENAI_BLOCK.TEXT, text: part.text });
        } else if (part.type === OPENAI_BLOCK.IMAGE_URL || part.type === OPENAI_BLOCK.IMAGE) {
          const img = toImageBlock(part);
          if (img) blocks.push(img);
          else blocks.push({ type: OPENAI_BLOCK.TEXT, text: "[image omitted]" });
        } else if (typeof part.text === "string") {
          blocks.push({ type: OPENAI_BLOCK.TEXT, text: part.text });
        }
      }
    }
    return blocks.length ? blocks : [{ type: OPENAI_BLOCK.TEXT, text: "" }];
  }
  return [{ type: OPENAI_BLOCK.TEXT, text: String(content) }];
}

function safeParseJson(s) {
  if (s == null) return {};
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    // Fail open (a throw would fail the whole request) but NOT silently: a
    // malformed arguments string means the tool will be called with no
    // parameters, and hiding that makes the wrong call look correct.
    console.warn(`[commandcode] discarding malformed tool arguments (len=${s.length})`);
    return {};
  }
}

function convertMessages(messages = []) {
  const out = [];
  const systemTexts = [];
  let toolMedia = [];
  const flushToolMedia = () => {
    if (toolMedia.length) out.push({ role: ROLE.USER, content: toContentBlocks(toolMedia) });
    toolMedia = [];
  };

  for (const m of expandToolResultMessages(messages)) {
    if (!m) continue;
    const role = m.role;
    if (role !== ROLE.TOOL) flushToolMedia();

    if (role === ROLE.SYSTEM) {
      const t = flattenText(m.content);
      if (t) systemTexts.push(t);
      continue;
    }

    if (role === ROLE.TOOL) {
      const split = splitToolResultContent(m.content);
      const value = m.is_error && !split.text.startsWith(TOOL_ERROR_PREFIX)
        ? TOOL_ERROR_PREFIX + split.text : split.text;
      toolMedia.push(...split.media);
      out.push({
        role: ROLE.TOOL,
        content: [{
          type: "tool-result",
          toolCallId: m.tool_call_id || "",
          toolName: m.name || "",
          output: { type: "text", value },
        }],
      });
      continue;
    }

    if (role === ROLE.ASSISTANT) {
      const blocks = [];
      const rc = m.reasoning_content || m.thought || m.reasoning;
      if (rc || (Array.isArray(m.tool_calls) && m.tool_calls.length > 0)) {
        blocks.push({ type: "reasoning", text: rc || " " });
      }
      const text = flattenText(m.content);
      if (text) blocks.push({ type: OPENAI_BLOCK.TEXT, text });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const fn = tc.function || {};
          blocks.push({
            type: "tool-call",
            toolCallId: tc.id || "",
            toolName: fn.name || "",
            input: safeParseJson(fn.arguments),
          });
        }
      }
      out.push({ role: ROLE.ASSISTANT, content: blocks.length ? blocks : [{ type: OPENAI_BLOCK.TEXT, text: "" }] });
      continue;
    }

    out.push({ role: ROLE.USER, content: toContentBlocks(m.content) });
  }

  flushToolMedia();
  return { messages: out, system: systemTexts.join("\n\n") };
}

function convertTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const result = [];
  for (const t of tools) {
    if (!t) continue;
    if (t.type === OPENAI_BLOCK.FUNCTION && t.function) {
      result.push({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters || { type: "object" },
      });
    } else if (t.name && (t.input_schema || t.parameters)) {
      result.push({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema || t.parameters,
      });
    }
  }
  return result.length ? result : undefined;
}

export function openaiToCommandCodeRequest(model, body, stream /* , credentials */) {
  const { messages, system } = convertMessages(body.messages);
  // CommandCode's upstream schema rejects max_tokens above 200000 with a 400
  // (9router #4691). Clients send the advertised model ceiling (e.g. 384000
  // for deepseek-v4-pro), so clamp every output-cap spelling to the limit.
  const rawMaxTokens = readOutputTokenCap(body, ["max_completion_tokens", "max_tokens", "max_output_tokens"]) ?? DEFAULT_MAX_TOKENS;
  const max_tokens = typeof rawMaxTokens === "number" && rawMaxTokens > 0
    ? Math.min(rawMaxTokens, COMMANDCODE_MAX_OUTPUT_TOKENS)
    : COMMANDCODE_MAX_OUTPUT_TOKENS;
  const params = {
    model,
    messages,
    stream: stream !== false,
    max_tokens,
    temperature: body.temperature ?? 0.3,
  };

  if (system) params.system = system;

  const tools = convertTools(body.tools);
  if (tools) params.tools = tools;
  if (body.top_p != null) params.top_p = body.top_p;

  const today = new Date().toISOString().slice(0, 10);

  return {
    // _clientSessionId may be a connection/history fallback or an unscoped
    // caller value. This translator does not receive a verified client/tenant
    // identity, and raw Authorization can be unvalidated in local mode. Never
    // infer continuity until a trusted client scope is passed through the stack.
    threadId: createCommandCodeSessionId(),
    memory: "",
    config: {
      workingDir: COMMAND_CODE_WORKING_DIR,
      date: today,
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params,
  };
}

register(FORMATS.OPENAI, FORMATS.COMMANDCODE, openaiToCommandCodeRequest, null);
