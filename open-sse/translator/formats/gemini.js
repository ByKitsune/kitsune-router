// Gemini helper functions for translator

import { safeParseJSON } from "../concerns/json.js";
import { normalizeMediaPart, splitToolResultContent, isExplicitToolMediaPart } from "../concerns/multimodal.js";
import { GEMINI_ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM, TOOL_ERROR_PREFIX } from "../schema/index.js";
import { collapseTextParts } from "../concerns/message.js";
import { isGemini4Model } from "../../config/models.js";

// Unsupported JSON Schema constraints that should be removed for Antigravity
export const UNSUPPORTED_SCHEMA_CONSTRAINTS = [
  // Basic constraints (not supported by Gemini API)
  "minLength", "maxLength", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "format", "multipleOf",
  // Array keywords the Gemini schema proto has no field for. Agent tool
  // schemas set these routinely, and one occurrence rejects the whole request
  // with "Unknown name ...: Cannot find field".
  "uniqueItems", "contains",
  // 2020-12 keywords with no Gemini equivalent
  "unevaluatedProperties", "unevaluatedItems", "contentSchema", "prefixItems",
  // Claude rejects these in VALIDATED mode
  "default", "examples", "example",
  // JSON Schema meta keywords
  "$schema", "$defs", "definitions", "const", "$ref", "$comment", "$id",
  // Annotation keywords (rejected by Gemini/Antigravity - e.g. MCP tool schemas set these)
  "deprecated", "readOnly", "writeOnly",
  // Object validation keywords (not supported)
  "additionalProperties", "propertyNames", "patternProperties", "enumDescriptions", "strict",
  // Complex schema keywords (handled by flattenAnyOfOneOf/mergeAllOf)
  "anyOf", "oneOf", "allOf", "not",
  // Dependency keywords (not supported)
  "dependencies", "dependentSchemas", "dependentRequired",
  // Other unsupported keywords
  "title", "optional", "if", "then", "else", "contentMediaType", "contentEncoding",
  // Vendor-specific extensions from OpenAI / Anthropic / MCP / Cursor
  "encrypted", "cache_control",
  // UI/Styling properties (from Cursor tools - NOT JSON Schema standard)
  "cornerRadius", "fillColor", "fontFamily", "fontSize", "fontWeight",
  "gap", "padding", "strokeColor", "strokeThickness", "textColor",
  // Non-standard annotation/error keywords used by some MCP tool schemas (#4283).
  // Gemini's schema proto has no field for these and rejects the whole request with
  // "Unknown name X: Cannot find field" if any nested schema node carries them.
  "errorMessage", "errorMessages", "x-errorMessage", "x-errorMessages",
  "markdownDescription", "x-intellij-html-description",
  "x-taplo-info", "x-taplo", "doNotSuggest", "suggestSortText",
  "minProperties", "maxProperties"
];

// Default safety settings
export const DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
];

// Convert OpenAI content to Gemini parts
export function convertOpenAIContentToParts(content) {
  const parts = [];

  if (typeof content === "string") {
    if (content.trim() !== "") {
      parts.push({ text: content });
    }
  } else if (Array.isArray(content)) {
    for (const item of content) {
      const start = parts.length;
      if (item.type === OPENAI_BLOCK.TEXT && item.text && item.text.trim() !== "") {
        parts.push({ text: item.text });
      } else if (item.type === OPENAI_BLOCK.IMAGE_URL && item.image_url?.url?.startsWith("data:")) {
        const url = item.image_url.url;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimePart = url.substring(5, commaIndex); // skip "data:"
          const data = url.substring(commaIndex + 1);
          const mimeType = mimePart.split(";")[0];

          parts.push({
            inlineData: { mime_type: mimeType, data: data }
          });
        }
      } else if (item.type === OPENAI_BLOCK.IMAGE_URL && item.image_url?.url && (item.image_url.url.startsWith("http://") || item.image_url.url.startsWith("https://"))) {
        parts.push({
          fileData: { fileUri: item.image_url.url, mimeType: item.image_url.mime_type || item.image_url.mimeType || "image/*" }
        });
      } else if (item.type === OPENAI_BLOCK.INPUT_AUDIO && item.input_audio?.data) {
        const format = item.input_audio.format || "wav";
        const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
        parts.push({
          inlineData: { mime_type: mimeType, data: item.input_audio.data }
        });
      } else if (item.type === OPENAI_BLOCK.AUDIO_URL && item.audio_url?.url?.startsWith("data:")) {
        const url = item.audio_url.url;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimePart = url.substring(5, commaIndex);
          const data = url.substring(commaIndex + 1);
          const mimeType = mimePart.split(";")[0];
          parts.push({
            inlineData: { mime_type: mimeType, data: data }
          });
        }
      } else if (item.type === OPENAI_BLOCK.FILE && item.file?.file_data?.startsWith("data:")) {
        const url = item.file.file_data;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimeType = url.substring(5, commaIndex).split(";")[0];
          const data = url.substring(commaIndex + 1);
          parts.push({ inlineData: { mime_type: mimeType, data: data } });
        }
      } else if ((item.type === OPENAI_BLOCK.VIDEO_URL || item.type === "video_url") && item.video_url?.url) {
        const url = item.video_url.url;
        if (url.startsWith("data:")) {
          const commaIndex = url.indexOf(",");
          if (commaIndex !== -1) {
            const mimeType = url.substring(5, commaIndex).split(";")[0] || "video/mp4";
            const data = url.substring(commaIndex + 1);
            parts.push({ inlineData: { mime_type: mimeType, data: data } });
          }
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          parts.push({ fileData: { fileUri: url, mimeType: "video/mp4" } });
        }
      } else if ((item.type === OPENAI_BLOCK.INPUT_VIDEO || item.type === "input_video") && item.input_video?.data) {
        const format = item.input_video.format || "mp4";
        const mimeType = `video/${format}`;
        parts.push({ inlineData: { mime_type: mimeType, data: item.input_video.data } });
      }
      const signature = item.extra_content?.google?.thought_signature;
      if (parts.length > start && typeof signature === "string") {
        parts.at(-1).thoughtSignature = signature;
      }
    }
  }

  return parts;
}

// Native Google pivots must not join separately signed text Parts. Final Chat
// lowering still applies its ordinary string-safe content policy afterward.
export function collapseGeminiParts(parts) {
  return parts.some(part => typeof part.extra_content?.google?.thought_signature === "string") ? parts : collapseTextParts(parts);
}

// Gemini's legacy Schema is an OpenAPI/protobuf dialect, not JSON Schema.
export function geminiSchemaToJSONSchema(schema, preservePropertyOrdering = false) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const { nullable, enumDescriptions, propertyOrdering, ...result } = schema;
  if (preservePropertyOrdering && propertyOrdering !== undefined) result.propertyOrdering = structuredClone(propertyOrdering);
  if (typeof result.type === "string") result.type = result.type.toLowerCase();
  for (const key of ["properties", "$defs", "definitions", "patternProperties"]) {
    if (result[key] && typeof result[key] === "object") {
      result[key] = Object.fromEntries(Object.entries(result[key]).map(([name, child]) => [name, geminiSchemaToJSONSchema(child, preservePropertyOrdering)]));
    }
  }
  for (const key of ["items", "additionalProperties", "not"]) {
    if (result[key] && typeof result[key] === "object") result[key] = geminiSchemaToJSONSchema(result[key], preservePropertyOrdering);
  }
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    if (Array.isArray(result[key])) result[key] = result[key].map(child => geminiSchemaToJSONSchema(child, preservePropertyOrdering));
  }
  if (nullable === true) {
    if (result.type) result.type = [...new Set([...(Array.isArray(result.type) ? result.type : [result.type]), "null"])];
    else return { anyOf: [result, { type: "null" }] };
  }
  return result;
}

export function copyGeminiRequestControls(result, request) {
  const config = request.generationConfig || {};
  if (config.topK !== undefined) result.top_k = config.topK;
  if (config.seed !== undefined) result.seed = config.seed;
  if (Array.isArray(config.stopSequences)) result.stop = [...config.stopSequences];
  if (config.responseMimeType === "application/json") {
    const schema = config.responseJsonSchema ?? (config.responseSchema ? geminiSchemaToJSONSchema(config.responseSchema, true) : undefined);
    result.response_format = schema === undefined ? { type: "json_object" }
      : { type: "json_schema", json_schema: { name: "response", schema } };
  }
  const choice = request.toolConfig?.functionCallingConfig;
  if (!choice) return;
  if (choice.mode === "NONE") result.tool_choice = "none";
  else if (choice.mode === "ANY" && choice.allowedFunctionNames?.length === 1) {
    result.tool_choice = { type: OPENAI_BLOCK.FUNCTION, function: { name: choice.allowedFunctionNames[0] } };
  } else if (["ANY", "AUTO", "VALIDATED"].includes(choice.mode)) {
    const mode = choice.mode === "ANY" ? "required" : "auto";
    result.tool_choice = choice.allowedFunctionNames?.length ? {
      type: "allowed_tools", allowed_tools: { mode, tools: choice.allowedFunctionNames.map(name => ({ type: OPENAI_BLOCK.FUNCTION, function: { name } })) },
    } : mode;
  }
}


// Only explicit content blocks in result/output arrays are attachments. A
// record with an inlineData property, nested examples and JSON strings are data.
function splitGeminiResponseMedia(response, convertMedia) {
  let cleaned = response;
  const media = [];
  for (const key of ["result", "output"]) {
    if (!Array.isArray(response?.[key])) continue;
    const remaining = [];
    const start = media.length;
    for (const item of response[key]) {
      const explicitPart = isExplicitToolMediaPart(item);
      const normalized = explicitPart ? normalizeMediaPart(item) : null;
      const converted = normalized ? convertMedia(normalized) : [];
      if (converted.length) media.push(...converted);
      else remaining.push(item);
    }
    if (media.length === start) continue;
    if (cleaned === response) cleaned = { ...response };
    // Mixed JSON arrays retain their original values and text block metadata.
    // Only a purely textual remainder uses the legacy string representation.
    cleaned[key] = remaining.every(item => typeof item === "string" ||
      (item?.type === OPENAI_BLOCK.TEXT && typeof item.text === "string"))
      ? splitToolResultContent(remaining).text : remaining;
  }
  return { response: cleaned, media };
}

// Called on Core's private request clone, including native passthrough. Only
// recognized legacy media arrays are lowered; ordinary Structs stay untouched.
export function normalizeGeminiToolResultMedia(body) {
  const request = body?.request || body;
  let count = 0;
  for (const turn of request?.contents || []) {
    if (!Array.isArray(turn.parts)) continue;
    for (let index = 0; index < turn.parts.length; index++) {
      const response = turn.parts[index].functionResponse;
      if (!response) continue;
      const { response: cleaned, media: parts } = splitGeminiResponseMedia(response.response, part => convertOpenAIContentToParts([part]));
      if (!parts.length) continue;
      response.response = cleaned;
      // Adjacent Content parts work on older Gemini models too. Do not append
      // to caller-native FunctionResponse.parts, whose support is model-specific.
      turn.parts.splice(index + 1, 0, ...parts);
      index += parts.length;
      count += parts.length;
    }
  }
  return count;
}

// Tool JSON remains a Struct; recognized content blocks put media beside it.
export function convertToolResultToGemini(content, isError = false) {
  let value = content ?? "";
  let media = [];
  if (Array.isArray(value) || normalizeMediaPart(value)) {
    const split = splitToolResultContent(value);
    if (split.media.length || (Array.isArray(value) && value.some(part => part?.type === OPENAI_BLOCK.TEXT))) {
      value = split.text;
      media = split.media;
    }
  }
  const markedError = typeof value === "string" && value.startsWith(TOOL_ERROR_PREFIX);
  // A replayed error wrapper must remain a Struct rather than accumulating
  // another JSON string at every Claude/Gemini hop. Plain traces keep their marker.
  const errorValue = markedError ? tryParseJSON(value.slice(TOOL_ERROR_PREFIX.length)) : null;
  let response = errorValue && typeof errorValue === "object" && Object.hasOwn(errorValue, "error") ? errorValue : tryParseJSON(value);
  isError ||= markedError;
  if (response === null || typeof response !== "object") response = { result: value };
  else if (Array.isArray(response)) response = { result: response };
  if (isError && !Object.hasOwn(response, "error")) response = { ...response, error: true };
  return { response, parts: convertOpenAIContentToParts(media) };
}

// Keep the complete response wrapper so JSON-looking strings, falsy results and
// sibling metadata survive another OpenAI -> Gemini hop without quote growth.
export function convertGeminiFunctionResponseContent(functionResponse) {
  const { response, media } = splitGeminiResponseMedia(functionResponse.response ?? {}, part => [part]);
  for (const part of functionResponse.parts || []) {
    const normalized = normalizeMediaPart(part);
    if (normalized) media.push(normalized);
  }
  const text = JSON.stringify(response);
  return media.length ? [{ type: OPENAI_BLOCK.TEXT, text }, ...media] : text;
}

// Extract text content from OpenAI content
export function extractTextContent(content, separator = "") {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === OPENAI_BLOCK.TEXT).map(c => c.text).join(separator);
  }
  return "";
}

// Try parse JSON safely (null fallback on parse error; re-export keeps legacy API)
export function tryParseJSON(str) {
  return safeParseJSON(str, null);
}

// Generate request ID
export function generateRequestId() {
  return `agent-${crypto.randomUUID()}`;
}

// Generate session ID (binary-compatible format: UUID + timestamp)
export function generateSessionId() {
  return crypto.randomUUID() + Date.now().toString();
}

// Generate project ID
export function generateProjectId() {
  const adjectives = ["useful", "bright", "swift", "calm", "bold"];
  const nouns = ["fuze", "wave", "spark", "flow", "core"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}-${noun}-${crypto.randomUUID().slice(0, 5)}`;
}

// Helper: Remove unsupported keywords recursively from object/array
// Also strips all vendor extension fields (x- prefixed) not supported by Gemini.
// isSchema tracks whether obj is a schema node vs a property-name map (#2884).
function removeUnsupportedKeywords(obj, keywords, isSchema = true) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      removeUnsupportedKeywords(item, keywords, isSchema);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (isSchema && (keywords.includes(key) || key.startsWith("x-"))) {
      delete obj[key];
      continue;
    }

    const value = obj[key];
    if (value && typeof value === "object") {
      removeUnsupportedKeywords(
        value,
        keywords,
        isSchema ? key !== "properties" : true
      );
    }
  }
}

// Keys whose value is a MAP of schemas (name -> schema), not a schema itself.
// A tool may legitimately declare a property named "properties" or "items", so a
// blind `Object.values()` walk would treat the map as a schema node and mutate it.
const SCHEMA_MAPS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];

// Visit child schemas without ever mistaking a schema map for a schema.
function forEachChildSchema(obj, fn) {
  for (const [key, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;
    if (SCHEMA_MAPS.includes(key)) {
      for (const sub of Object.values(value)) if (sub && typeof sub === "object") fn(sub);
    } else if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item === "object") fn(item);
    } else {
      fn(value);
    }
  }
}

// Convert const to enum
function convertConstToEnum(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.const !== undefined && !obj.enum) {
    obj.enum = [obj.const];
    delete obj.const;
  }

  forEachChildSchema(obj, convertConstToEnum);
}

// Google's legacy tool Schema only carries nonempty string enum members.
// This compatibility path is already lossy: numeric/boolean literals become
// strings and explicit types are retained. Omit null/undefined/empty members
// rather than inventing literals ("null", "undefined"); never trim valid values.
// Filtering narrows a mixed enum; omitting an exhausted/invalid enum broadens it
// (including const:""/null after conversion). This is NOT strict JSON Schema
// enforcement; callers needing exact enum/const semantics need another backend.
function convertEnumValuesToStrings(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.enum !== undefined) {
    const values = Array.isArray(obj.enum)
      ? obj.enum.filter(v => v !== null && v !== undefined).map(v => String(v)).filter(v => v.length > 0)
      : [];
    if (values.length > 0) obj.enum = values;
    else delete obj.enum;
    if (!obj.type) obj.type = "string";
  }

  forEachChildSchema(obj, convertEnumValuesToStrings);
}

// Merge allOf schemas
function mergeAllOf(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.allOf && Array.isArray(obj.allOf)) {
    const merged = {};

    for (const item of obj.allOf) {
      if (item.properties) {
        if (!merged.properties) merged.properties = {};
        Object.assign(merged.properties, item.properties);
      }
      if (item.required && Array.isArray(item.required)) {
        if (!merged.required) merged.required = [];
        for (const req of item.required) {
          if (!merged.required.includes(req)) {
            merged.required.push(req);
          }
        }
      }
    }

    delete obj.allOf;
    if (merged.properties) obj.properties = { ...obj.properties, ...merged.properties };
    if (merged.required) obj.required = [...(obj.required || []), ...merged.required];
  }

  forEachChildSchema(obj, mergeAllOf);
}

// Select best schema from anyOf/oneOf
function selectBest(items) {
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let score = 0;
    const type = item.type;

    if (type === "object" || item.properties) {
      score = 3;
    } else if (type === "array" || item.items) {
      score = 2;
    } else if (type && type !== "null") {
      score = 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// Flatten anyOf/oneOf
function flattenAnyOfOneOf(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length > 0) {
    const nonNullSchemas = obj.anyOf.filter(s => s && s.type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete obj.anyOf;
      Object.assign(obj, selected);
    }
  }

  if (obj.oneOf && Array.isArray(obj.oneOf) && obj.oneOf.length > 0) {
    const nonNullSchemas = obj.oneOf.filter(s => s && s.type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete obj.oneOf;
      Object.assign(obj, selected);
    }
  }

  forEachChildSchema(obj, flattenAnyOfOneOf);
}

// Flatten type arrays
function flattenTypeArrays(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.type && Array.isArray(obj.type)) {
    const nonNullTypes = obj.type.filter(t => t !== "null");
    if (nonNullTypes.length === 0) obj.type = "string";
    else if (nonNullTypes.length === 1) obj.type = nonNullTypes[0];
    else if (obj.properties && nonNullTypes.includes("object")) obj.type = "object";
    else if (obj.items && typeof obj.items === "object" && !Array.isArray(obj.items) && obj.items.type && nonNullTypes.includes("array")) obj.type = "array";
    else obj.type = ["string", "number", "integer", "boolean"].find(type => nonNullTypes.includes(type)) || nonNullTypes[0];
  }

  forEachChildSchema(obj, flattenTypeArrays);
}

// Infer missing type=object when properties exist (Gemini requires explicit type)
function ensureObjectType(obj) {
  if (!obj || typeof obj !== "object") return;
  if (obj.properties && !obj.type) obj.type = "object";
  if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
    for (const [, propSchema] of Object.entries(obj.properties)) {
      if (propSchema && typeof propSchema === "object" && !Array.isArray(propSchema)) {
        if (!propSchema.type) {
          if (propSchema.properties) propSchema.type = "object";
          else if (propSchema.items) propSchema.type = "array";
          else propSchema.type = "string";
        }
      }
    }
  }
  forEachChildSchema(obj, ensureObjectType);
}

// Compare the original tuple schemas, ignoring object-key order but NOT
// constraints that later sanitizer passes may discard or approximate.
function sameTupleSchema(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameTupleSchema(left[key], right[key]));
}

// Google's positional tuple keywords cannot reach its single-Schema items
// field. Validate both drafts before prefixItems can fall through selectBest.
// Only structurally identical explicit tails are accepted (after lossless
// string shorthand expansion); no schema-equivalence/boolean compiler is used.
// Omitted tails still use the legacy homogeneous approximation, which narrows
// the default unconstrained tail. This is NOT strict JSON Schema tuple support.
// Empty legacy items keep the bare-array fallback only without an explicit tail.
function normalizeTupleItems(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  // Check prefix tails before an items array can be rewritten as a legacy tuple.
  for (const keyword of ["prefixItems", "items"]) {
    if (!Array.isArray(obj[keyword])) continue;
    // Expand only the lossless string shorthand here, not lossy schema passes.
    const tuple = obj[keyword].map(item => typeof item === "string" ? { type: item } : item);
    // No prefix positions: leave the ordinary items schema to the existing passes.
    if (keyword === "prefixItems" && tuple.length === 0) continue;
    const tailKeyword = keyword === "items" ? "additionalItems" : "items";
    const tail = typeof obj[tailKeyword] === "string" ? { type: obj[tailKeyword] } : obj[tailKeyword];
    const incompatibleTail = Object.hasOwn(obj, tailKeyword) &&
      !sameTupleSchema(tuple[0], tail);
    if (incompatibleTail || (tuple.length > 0 && !tuple.every(item => item && typeof item === "object" &&
      !Array.isArray(item) && sameTupleSchema(item, tuple[0])))) {
      throw Object.assign(new Error("Tool schema contains heterogeneous tuple items or incompatible tuple tails; use a uniform array schema."), {
        code: "unsupported_parameter", type: "invalid_request_error", status: 400, param: "tools",
      });
    }
    // An empty tuple has no positional schema; retain the bare-array fallback.
    if (keyword === "items") {
      obj.items = tuple[0] || { type: "string" };
      // The matching tail is now covered by items; Gemini has no additionalItems.
      delete obj.additionalItems;
    } else obj.prefixItems = tuple;
  }
  // Validate actual subschemas only, not annotation/literal or extension data.
  // Keep the compatibility passes' general-purpose traversal unchanged.
  for (const [key, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;
    if (SCHEMA_MAPS.includes(key) || key === "dependencies") {
      if (!Array.isArray(value)) {
        for (const sub of Object.values(value)) {
          // Legacy property-dependency arrays are names, not schemas.
          if (sub && typeof sub === "object" && !Array.isArray(sub)) normalizeTupleItems(sub);
        }
      }
    } else if (["allOf", "anyOf", "oneOf", "prefixItems"].includes(key) && Array.isArray(value)) {
      for (const sub of value) normalizeTupleItems(sub);
    } else if ((SCHEMA_SLOTS.includes(key) || key === "additionalProperties" || key === "unevaluatedProperties") &&
      !Array.isArray(value)) {
      normalizeTupleItems(value);
    }
  }
}

// Convert prefixItems (tuple validation) to items — Gemini cannot express tuples,
// and a type:"array" schema without items is rejected with "missing field"
function convertPrefixItems(obj) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj.prefixItems) && obj.prefixItems.length > 0) {
    const variants = obj.prefixItems.filter(s => s && s.type !== "null");
    if (!obj.items && variants.length === 1) {
      obj.items = variants[0];
    } else if (!obj.items && variants.length > 1) {
      obj.items = { anyOf: variants };
    }
    delete obj.prefixItems;
  }

  forEachChildSchema(obj, convertPrefixItems);
}

// Gemini requires items on every type:"array" schema — fill a permissive placeholder
function ensureArrayItems(obj) {
  if (!obj || typeof obj !== "object") return;
  if (obj.type === "array" && !obj.items) {
    obj.items = { type: "string" };
  }
  forEachChildSchema(obj, ensureArrayItems);
}

// Gemini's Schema proto only permits items on arrays and properties/required
// on objects. Walk schema nodes rather than property-name maps: a tool may
// itself declare properties called "items", "properties" or "required".
function enforceSchemaTypePredicates(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

  if (obj.type === "array") {
    if (!obj.items || typeof obj.items !== "object" || Array.isArray(obj.items)) {
      obj.items = { type: "string" };
    } else if (!obj.items.type) {
      obj.items.type = obj.items.properties ? "object" : obj.items.items ? "array" : "string";
    }
  } else delete obj.items;

  if (obj.type !== "object") {
    delete obj.properties;
    delete obj.required;
  }

  forEachChildSchema(obj, enforceSchemaTypePredicates);
}

// Expand shorthand string schemas into real Schema objects.
//
// JSON Schema requires every subschema to be an object, but agent and MCP tool
// definitions routinely use the shorthand `{ value: "object" }` for
// `{ value: { type: "object" } }`. Gemini's proto has no union for this and
// rejects the whole request:
//   Invalid value at 'tools[0].function_declarations[N].parameters
//   .properties[M].value' (...Schema), "object"
//
// Every other pass here recurses only into `typeof x === "object"`, so a string
// subschema is invisible to them — this must run first, and must rewrite the
// parent's slot rather than the (primitive, unmodifiable) value itself.
const SCHEMA_SLOTS = ["items", "additionalItems", "contains", "if", "then", "else", "not", "propertyNames", "unevaluatedItems", "contentSchema"];

function expandStringSchemas(obj) {
  if (!obj || typeof obj !== "object") return;

  const expand = (value) => (typeof value === "string" ? { type: value } : value);

  for (const slot of SCHEMA_SLOTS) {
    if (typeof obj[slot] === "string") obj[slot] = expand(obj[slot]);
  }

  for (const mapKey of SCHEMA_MAPS) {
    const map = obj[mapKey];
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === "string") map[key] = expand(value);
      else if (typeof value === "boolean") map[key] = { type: "string" };
    }
  }

  // `additionalProperties: false` is a valid boolean and is stripped later;
  // only a string form is shorthand for a schema.
  if (typeof obj.additionalProperties === "string") {
    obj.additionalProperties = expand(obj.additionalProperties);
  }

  forEachChildSchema(obj, expandStringSchemas);
}

// Clean JSON Schema for Antigravity API compatibility - removes unsupported keywords recursively
export function cleanJSONSchemaForAntigravity(schema) {
  if (!schema || typeof schema !== "object") return schema;

  // Mutate directly (schema is only used once per request)
  let cleaned = schema;

  // Compare tuples before lossy enum/constraint/composition conversions.
  normalizeTupleItems(cleaned);

  // Phase 0: Expand shorthand string subschemas — must run before any pass that
  // recurses on `typeof x === "object"`, which would otherwise skip them entirely.
  expandStringSchemas(cleaned);

  // Phase 1: Convert and prepare
  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);

  // Phase 2: Flatten complex structures
  mergeAllOf(cleaned);
  convertPrefixItems(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);

  // Phase 2.5: Infer missing type=object when properties exist (Gemini requirement)
  ensureObjectType(cleaned);
  ensureArrayItems(cleaned);

  // Phase 3: Remove all unsupported keywords at ALL levels (including inside arrays)
  removeUnsupportedKeywords(cleaned, UNSUPPORTED_SCHEMA_CONSTRAINTS);

  // Phase 4: Cleanup required fields recursively
  function cleanupRequired(obj) {
    if (!obj || typeof obj !== "object") return;

    if (obj.required && Array.isArray(obj.required) && obj.properties) {
      const validRequired = obj.required.filter(field =>
        Object.prototype.hasOwnProperty.call(obj.properties, field)
      );
      if (validRequired.length === 0) {
        delete obj.required;
      } else {
        obj.required = validRequired;
      }
    }

    // Recurse into nested objects
    forEachChildSchema(obj, cleanupRequired);
  }

  cleanupRequired(cleaned);

  // Phase 5: Add placeholder for empty object schemas (Antigravity requirement)
  function addPlaceholders(obj) {
    if (!obj || typeof obj !== "object") return;

    // Empty schema {} (no type, no properties) after $ref removal — treat as object with placeholder
    if (Object.keys(obj).length === 0) {
      obj.type = "object";
      obj.properties = {
        reason: {
          type: "string",
          description: "Brief explanation of why you are calling this tool"
        }
      };
      obj.required = ["reason"];
      return;
    }

    if (obj.type === "object") {
      if (!obj.properties || typeof obj.properties !== "object" || Array.isArray(obj.properties) || Object.keys(obj.properties).length === 0) {
        obj.properties = {
          reason: {
            type: "string",
            description: "Brief explanation of why you are calling this tool"
          }
        };
        obj.required = ["reason"];
      }
    }

    // Recurse into nested objects
    forEachChildSchema(obj, addPlaceholders);
  }

  addPlaceholders(cleaned);

  // Phase 6: remove protobuf fields whose predicate conflicts with the type.
  enforceSchemaTypePredicates(cleaned);

  return cleaned;
}

// Keep opaque/media Parts and parallel responses in their original relative
// order; Gemini 4 requires every functionResponse to follow the other Parts.
function orderFunctionResponsesLast(parts) {
  let responseSeen = false;
  let needsOrdering = false;
  for (const part of parts) {
    if (part.functionResponse) responseSeen = true;
    else if (responseSeen) {
      needsOrdering = true;
      break;
    }
  }
  if (!needsOrdering) return parts;
  const ordered = parts.filter(part => !part.functionResponse);
  for (const part of parts) {
    if (part.functionResponse) ordered.push(part);
  }
  return ordered;
}

// Merge adjacent same-role messages, strip empty parts, ensure initial and terminal user turns
export function normalizeGeminiContents(contents, model = null, { ensureUserTurns = true } = {}) {
  const out = [];
  for (const c of contents || []) {
    if (!c?.role || !Array.isArray(c.parts)) continue;
    const parts = c.parts.filter(p => p && Object.keys(p).length > 0);
    if (parts.length === 0) continue;
    const last = out.at(-1);
    if (last?.role === c.role) last.parts.push(...parts);
    else out.push({ ...c, parts: [...parts] });
  }
  if (isGemini4Model(model)) {
    for (const turn of out) {
      if (turn.role === GEMINI_ROLE.USER) turn.parts = orderFunctionResponsesLast(turn.parts);
    }
  }
  // Native callers own their terminal handoff; only translated histories use
  // the existing synthetic initial/terminal user-turn compatibility guards.
  if (!ensureUserTurns) return out;
  if (out.length > 0 && out[0].role !== "user") {
    out.unshift({ role: "user", parts: [{ text: "..." }] });
  }
  if (out.length > 0 && out.at(-1).role === "model") {
    const fnCalls = (out.at(-1).parts || []).filter(p => p && p.functionCall);
    if (fnCalls.length > 0) {
      if (isGemini4Model(model)) return out;
      const responses = fnCalls.map(p => {
        const call = p.functionCall || {};
        const fr = {
          name: call.name || "tool",
          response: { result: "Continue." }
        };
        if (call.id) fr.id = call.id;
        return { functionResponse: fr };
      });
      out.push({ role: "user", parts: responses });
    } else {
      out.push({ role: "user", parts: [{ text: "Continue." }] });
    }
  }
  return out;
}
