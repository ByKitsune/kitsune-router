import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { CLAUDE_SYSTEM_PROMPT } from "../../config/appConstants.js";
import { DEFAULT_MAX_TOKENS } from "../../config/runtimeConfig.js";
import { DEFAULT_THINKING_CLAUDE_SIGNATURE } from "../../config/defaultThinkingSignature.js";
import { adjustMaxTokens } from "../formats/maxTokens.js";
import { safeParseJSON } from "../concerns/json.js";
import { parseDataUri } from "../concerns/image.js";
import { extractTextContent } from "../formats/gemini.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK } from "../schema/index.js";
import { getCapabilitiesForModel } from "../../providers/capabilities.js";

// Empty prefix matches real Claude Code behavior (no tool name prefix).
// Previously "proxy_" was used but this is a detectable fingerprint difference.
const CLAUDE_OAUTH_TOOL_PREFIX = "";

// Normalize input schema to satisfy Anthropic requirement: input_schema.type MUST be "object" (#4075)
export function normalizeClaudeInputSchema(rawSchema) {
  if (!rawSchema || typeof rawSchema !== "object" || Array.isArray(rawSchema)) {
    return { type: "object", properties: {}, required: [] };
  }

  const schema = { ...rawSchema };
  schema.type = "object";

  const branches = schema.anyOf || schema.oneOf || schema.allOf;
  if (Array.isArray(branches)) {
    if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
      schema.properties = {};
    }
    if (Object.keys(schema.properties).length === 0) {
      for (const branch of branches) {
        if (branch && typeof branch === "object" && branch.properties && typeof branch.properties === "object") {
          Object.assign(schema.properties, branch.properties);
        }
      }
    }
  }

  return schema;
}

// Convert OpenAI request to Claude format
export function openaiToClaudeRequest(model, body, stream) {
  // Tool name mapping for Claude OAuth (capitalizedName → originalName)
  const toolNameMap = new Map();
  // Cap max_tokens at the model's real output ceiling (e.g. Opus 4.8 = 128000),
  // not the conservative 64000 default — otherwise a high-output model is
  // pre-clamped here before prepareClaudeRequest's model-aware step runs.
  const modelCeiling = getCapabilitiesForModel(null, model).maxOutput || DEFAULT_MAX_TOKENS;
  // Modern OpenAI caps take precedence; neither tools nor thinking may spend
  // beyond an explicit client limit. Defaults retain the shared helper policy.
  const clientCap = body.max_completion_tokens ?? body.max_tokens;
  const result = {
    model: model,
    max_tokens: clientCap == null ? adjustMaxTokens(body, modelCeiling) : Math.min(clientCap, modelCeiling),
    stream: stream
  };

  // Temperature
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }

  // Sampling / determinism parameters.
  //
  // These were previously dropped, which is the "succeeds but behaves
  // differently" class of bug: a client that sets `stop: ["</end>"]` for
  // deterministic truncation silently received untruncated output whenever the
  // gateway routed to Claude — including when a combo failed over mid-request.
  // Anthropic's Messages API accepts all of these, so they map directly.
  if (body.top_p !== undefined) {
    result.top_p = body.top_p;
  }
  // OpenAI `stop` (string or array) ⇄ Anthropic `stop_sequences` (array).
  if (body.stop !== undefined) {
    const stops = Array.isArray(body.stop) ? body.stop : [body.stop];
    const cleaned = stops.filter((s) => typeof s === "string" && s.length > 0);
    if (cleaned.length > 0) result.stop_sequences = cleaned;
  }
  // Anthropic has no `seed`; determinism is approximated by temperature/top_p,
  // so it is deliberately not invented here.
  // `user` maps to Anthropic's abuse-tracking field metadata.user_id.
  const metadataUser = typeof body.user === "string" && body.user.trim()
    ? body.user.trim()
    : null;
  if (metadataUser) {
    result.metadata = { ...(result.metadata || {}), user_id: metadataUser };
  }
  // Anthropic has no presence/frequency penalty. Deliberately NOT invented:
  // dropping them is documented behavior, and fabricating an equivalent would
  // change sampling in an unverifiable way.

  // Messages
  result.messages = [];
  const systemParts = [];

  if (body.messages && Array.isArray(body.messages)) {
    // Extract system messages
    for (const msg of body.messages) {
      if (msg.role === ROLE.SYSTEM) {
        systemParts.push(typeof msg.content === "string" ? msg.content : extractTextContent(msg.content, "\n"));
      }
    }

    // Filter out system messages for separate processing
    const nonSystemMessages = body.messages.filter(m => m.role !== ROLE.SYSTEM);

    // Process messages with merging logic
    // CRITICAL: tool_result must be in separate message immediately after tool_use
    let currentRole = undefined;
    let currentParts = [];

    const flushCurrentMessage = () => {
      if (currentRole && currentParts.length > 0) {
        result.messages.push({ role: currentRole, content: currentParts });
        currentParts = [];
      }
    };

    for (const msg of nonSystemMessages) {
      const newRole = (msg.role === ROLE.USER || msg.role === ROLE.TOOL) ? ROLE.USER : ROLE.ASSISTANT;
      const blocks = getContentBlocksFromMessage(msg, toolNameMap);
      const hasToolUse = blocks.some(b => b.type === CLAUDE_BLOCK.TOOL_USE);
      const hasToolResult = blocks.some(b => b.type === CLAUDE_BLOCK.TOOL_RESULT);

      // Separate tool_result from other content
      if (hasToolResult) {
        const toolResultBlocks = blocks.filter(b => b.type === CLAUDE_BLOCK.TOOL_RESULT);
        const otherBlocks = blocks.filter(b => b.type !== CLAUDE_BLOCK.TOOL_RESULT);

        flushCurrentMessage();

        if (toolResultBlocks.length > 0) {
          result.messages.push({ role: ROLE.USER, content: toolResultBlocks });
        }

        if (otherBlocks.length > 0) {
          currentRole = newRole;
          currentParts.push(...otherBlocks);
        }
        continue;
      }

      if (currentRole !== newRole) {
        flushCurrentMessage();
        currentRole = newRole;
      }

      currentParts.push(...blocks);

      if (hasToolUse) {
        flushCurrentMessage();
      }
    }

    flushCurrentMessage();

    // Add cache_control to last assistant message
    for (let i = result.messages.length - 1; i >= 0; i--) {
      const message = result.messages[i];
      if (message.role === ROLE.ASSISTANT && Array.isArray(message.content) && message.content.length > 0) {
        // Find the last block that can have cache_control (not thinking blocks)
        const validBlockTypes = [CLAUDE_BLOCK.TEXT, CLAUDE_BLOCK.TOOL_USE, CLAUDE_BLOCK.TOOL_RESULT, CLAUDE_BLOCK.IMAGE];
        for (let j = message.content.length - 1; j >= 0; j--) {
          const block = message.content[j];
          if (validBlockTypes.includes(block.type)) {
            block.cache_control = { type: "ephemeral" };
            break;
          }
        }
        break;
      }
    }
  }

  // Handle response_format for JSON mode
  if (body.response_format) {
    const responseFormat = body.response_format;
    if (responseFormat.type === "json_schema" && responseFormat.json_schema?.schema) {
      const schemaJson = JSON.stringify(responseFormat.json_schema.schema, null, 2);
      systemParts.push(`You must respond with valid JSON that strictly follows this JSON schema:
\`\`\`json
${schemaJson}
\`\`\`
Respond ONLY with the JSON object, no other text.`);
    } else if (responseFormat.type === "json_object") {
      systemParts.push("You must respond with valid JSON. Respond ONLY with a JSON object, no other text.");
    }
  }

  // System with Claude Code prompt and cache_control
  const claudeCodePrompt = { type: CLAUDE_BLOCK.TEXT, text: CLAUDE_SYSTEM_PROMPT };

  if (systemParts.length > 0) {
    const systemText = systemParts.join("\n");
    result.system = [
      claudeCodePrompt,
      { type: CLAUDE_BLOCK.TEXT, text: systemText, cache_control: { type: "ephemeral", ttl: "1h" } }
    ];
  } else {
    result.system = [claudeCodePrompt];
  }

  // Tools - convert from OpenAI format to Claude format with prefix for OAuth
  if (body.tools && Array.isArray(body.tools)) {
    result.tools = [];
    for (const tool of body.tools) {
      // Pass-through built-in tools (e.g. web_search_20250305) without prefix or conversion
      const toolType = tool.type;
      if (toolType && toolType !== OPENAI_BLOCK.FUNCTION) {
        result.tools.push(tool);
        continue;
      }

      // Function-shaped tools arrive in two flavors from real clients:
      //   (a) openai-spec: { type: "function", function: { name, ... } }
      //   (b) legacy/loose: { function: { name, ... } }   (no parent `type`)
      // Both must yield toolData.name = "echo". Treat the bare-function shape
      // as a function tool too — Anthropic-compatible gateways (notably
      // MiniMax M3 at api.minimaxi.com) reject payloads where this branch
      // falls through with `toolData.name === undefined`, returning their
      // upstream code (2013) "invalid tool type". See #2435.
      const toolData = tool.function ?? tool;
      const originalName = toolData.name;

      // Claude OAuth requires prefixed tool names to avoid conflicts
      const toolName = CLAUDE_OAUTH_TOOL_PREFIX + originalName;

      // Store mapping for response translation (prefixed → original)
      toolNameMap.set(toolName, originalName);

      const claudeTool = {
        name: toolName,
        description: toolData.description || "",
        input_schema: normalizeClaudeInputSchema(toolData.parameters || toolData.input_schema),
      };
      if (toolData.strict !== undefined) {
        claudeTool.strict = Boolean(toolData.strict);
      }
      result.tools.push(claudeTool);
    }

    if (result.tools.length > 0) {
      const lastTool = result.tools[result.tools.length - 1];
      if (!lastTool?.defer_loading) {
        lastTool.cache_control = { type: "ephemeral", ttl: "1h" };
      }
    }
  }

  // Tool choice & parallel tool calls (#4171)
  if (body.tool_choice || body.parallel_tool_calls !== undefined) {
    result.tool_choice = convertOpenAIToolChoice(body.tool_choice);
    if (body.parallel_tool_calls === false) {
      result.tool_choice.disable_parallel_tool_use = true;
    }
  }

  // Thinking is normalized centrally by applyThinking (thinkingUnified.js) after translation.

  // Claude Code auto-mode safeguards passthrough (#4173)
  if (body.safeguards !== undefined) {
    result.safeguards = body.safeguards;
  }

  // Attach toolNameMap to result for response translation
  if (toolNameMap.size > 0) {
    result._toolNameMap = toolNameMap;
  }

  return result;
}

// Native tool-result blocks (including documents, search results and tool
// references) must survive; only OpenAI image/file blocks need conversion.
function normalizeClaudeToolContent(content, toolNameMap) {
  if (!Array.isArray(content)) return content;
  const blocks = [];
  for (const part of content) {
    if (part.type === OPENAI_BLOCK.IMAGE_URL || part.type === OPENAI_BLOCK.FILE) {
      const converted = getContentBlocksFromMessage({ role: ROLE.USER, content: [part] }, toolNameMap);
      if (converted.length) blocks.push(...converted);
      else blocks.push({ type: CLAUDE_BLOCK.TEXT, text: JSON.stringify(part) });
    } else {
      blocks.push(part);
    }
  }
  return blocks;
}

// Get content blocks from single message
function getContentBlocksFromMessage(msg, toolNameMap = new Map()) {
  const blocks = [];

  if (msg.role === ROLE.TOOL) {
    // `is_error` is optional in Anthropic's public API (defaults false) but
    // REQUIRED by strict Anthropic-wire consumers — Zed's hosted AI rejects
    // tool_result blocks without it ("failed to parse Anthropic request:
    // missing field `is_error`", 9router #4463). OpenAI `role:"tool"` messages
    // carry no error flag, so the honest default is false.
    blocks.push({
      type: CLAUDE_BLOCK.TOOL_RESULT,
      tool_use_id: msg.tool_call_id,
      content: normalizeClaudeToolContent(msg.content, toolNameMap),
      is_error: msg.is_error === true
    });
  } else if (msg.role === ROLE.USER) {
    if (typeof msg.content === "string") {
      if (msg.content) {
        blocks.push({ type: CLAUDE_BLOCK.TEXT, text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === OPENAI_BLOCK.TEXT && part.text) {
          blocks.push({ type: CLAUDE_BLOCK.TEXT, text: part.text });
        } else if (part.type === CLAUDE_BLOCK.TOOL_RESULT) {
          blocks.push({
            type: CLAUDE_BLOCK.TOOL_RESULT,
            tool_use_id: part.tool_use_id,
            content: normalizeClaudeToolContent(part.content, toolNameMap),
            is_error: part.is_error === true
          });
        } else if (part.type === OPENAI_BLOCK.IMAGE_URL) {
          const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
          const parsed = parseDataUri(url);
          if (parsed) {
            blocks.push({
              type: CLAUDE_BLOCK.IMAGE,
              source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 }
            });
          } else if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
            blocks.push({
              type: CLAUDE_BLOCK.IMAGE,
              source: { type: "url", url }
            });
          }
        } else if (part.type === OPENAI_BLOCK.IMAGE && part.source) {
          blocks.push({ type: CLAUDE_BLOCK.IMAGE, source: part.source });
        } else if (part.type === OPENAI_BLOCK.FILE && part.file) {
          // OpenAI file block -> Claude document (PDF only; Claude rejects other mimes).
          const fileData = part.file.file_data;
          const parsed = parseDataUri(fileData);
          if (parsed && parsed.mimeType === "application/pdf") {
            blocks.push({
              type: CLAUDE_BLOCK.DOCUMENT,
              source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 }
            });
          }
        }
      }
    }
  } else if (msg.role === ROLE.ASSISTANT) {
    if (msg.reasoning_content) {
      blocks.push({
        type: CLAUDE_BLOCK.THINKING,
        thinking: msg.reasoning_content,
        signature: DEFAULT_THINKING_CLAUDE_SIGNATURE
      });
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === OPENAI_BLOCK.TEXT && part.text) {
          blocks.push({ type: CLAUDE_BLOCK.TEXT, text: part.text });
        } else if (part.type === CLAUDE_BLOCK.TOOL_USE) {
          // Tool name already has prefix from tool declarations, keep as-is
          blocks.push({ type: CLAUDE_BLOCK.TOOL_USE, id: part.id, name: part.name, input: part.input });
        } else if (part.type === CLAUDE_BLOCK.THINKING) {
          // Include thinking block but strip cache_control (not allowed on thinking blocks)
          const { cache_control, ...thinkingBlock } = part;
          blocks.push(thinkingBlock);
        }
      }
    } else if (msg.content) {
      const text = typeof msg.content === "string" ? msg.content : extractTextContent(msg.content, "\n");
      if (text) {
        blocks.push({ type: CLAUDE_BLOCK.TEXT, text });
      }
    }

    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.type === OPENAI_BLOCK.FUNCTION) {
          // Apply prefix to tool name
          const toolName = CLAUDE_OAUTH_TOOL_PREFIX + tc.function.name;
          blocks.push({
            type: CLAUDE_BLOCK.TOOL_USE,
            id: tc.id,
            name: toolName,
            input: safeParseJSON(tc.function.arguments, tc.function.arguments)
          });
        }
      }
    }
  }

  return blocks;
}

// Convert OpenAI tool choice to Claude format.
// Claude only accepts tool_choice.type of "auto" | "any" | "tool" | "none";
// anything else (e.g. OpenAI's "function") triggers a 400, so we never pass an
// unrecognized type through.
const CLAUDE_TOOL_CHOICE_TYPES = new Set(["auto", "any", "tool", "none"]);

function convertOpenAIToolChoice(choice) {
  if (!choice) return { type: "auto" };

  // OpenAI string forms: "auto" | "none" | "required"
  if (typeof choice === "string") {
    if (choice === "required") return { type: "any" };
    if (choice === "none") return { type: "none" };
    return { type: "auto" }; // "auto" or anything unexpected
  }

  if (typeof choice === "object") {
    // OpenAI forced tool: { type: "function", function: { name } }.
    // Checked before the native pass-through below, because the OpenAI shape
    // also carries a `.type` ("function") that Claude rejects.
    if (choice.function?.name) {
      return { type: "tool", name: choice.function.name };
    }
    // Already Claude-native — only pass through types Claude actually accepts,
    // so a malformed or unknown type can never leak into the upstream request.
    if (CLAUDE_TOOL_CHOICE_TYPES.has(choice.type)) {
      return choice;
    }
  }

  return { type: "auto" };
}

// OpenAI -> Claude format for Antigravity (without system prompt modifications)
function openaiToClaudeRequestForAntigravity(model, body, stream) {
  const result = openaiToClaudeRequest(model, body, stream);

  // Remove Claude Code system prompt, keep only user's system messages
  if (result.system && Array.isArray(result.system)) {
    result.system = result.system.filter(block =>
      !block.text || !block.text.includes("You are Claude Code")
    );
    if (result.system.length === 0) {
      delete result.system;
    }
  }

  // Strip prefix from tool names for Antigravity (doesn't use Claude OAuth)
  if (result.tools && Array.isArray(result.tools)) {
    result.tools = result.tools.map(tool => {
      if (tool.name && tool.name.startsWith(CLAUDE_OAUTH_TOOL_PREFIX)) {
        return {
          ...tool,
          name: tool.name.slice(CLAUDE_OAUTH_TOOL_PREFIX.length)
        };
      }
      return tool;
    });
  }

  // Strip prefix from tool_use in messages
  if (result.messages && Array.isArray(result.messages)) {
    result.messages = result.messages.map(msg => {
      if (!msg.content || !Array.isArray(msg.content)) {
        return msg;
      }

      const updatedContent = msg.content.map(block => {
        if (block.type === CLAUDE_BLOCK.TOOL_USE && block.name && block.name.startsWith(CLAUDE_OAUTH_TOOL_PREFIX)) {
          return {
            ...block,
            name: block.name.slice(CLAUDE_OAUTH_TOOL_PREFIX.length)
          };
        }
        return block;
      });

      return { ...msg, content: updatedContent };
    });
  }

  return result;
}

// Export for use in other translators
export { openaiToClaudeRequestForAntigravity };

// Register
register(FORMATS.OPENAI, FORMATS.CLAUDE, openaiToClaudeRequest, null);

