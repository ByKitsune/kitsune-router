/**
 * Responses API Transformer
 * Converts OpenAI Chat Completions SSE to Codex Responses API SSE format
 * Can be used in both Next.js and Cloudflare Workers
 */

import fs from "fs";
import path from "path";

import { createSSEStream } from "../utils/stream.js";
import { FORMATS } from "../translator/formats.js";

// Create log directory for responses (Node.js only)
export function createResponsesLogger(model, logsDir = null) {
  // Skip logging in worker environment (no fs)
  if (typeof fs.mkdirSync !== "function") {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const uniqueId = Math.random().toString(36).slice(2, 8);
  const baseDir = logsDir || (typeof process !== "undefined" ? process.cwd() : ".");
  const logDir = path.join(baseDir, "logs", `responses_${model}_${timestamp}_${uniqueId}`);
  
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    return null;
  }

  let inputEvents = [];
  let outputEvents = [];

  return {
    logInput: (event) => {
      inputEvents.push(event);
    },
    logOutput: (event) => {
      outputEvents.push(event);
    },
    flush: () => {
      try {
        fs.writeFileSync(path.join(logDir, "1_input_stream.txt"), inputEvents.join("\n"));
        fs.writeFileSync(path.join(logDir, "2_output_stream.txt"), outputEvents.join("\n"));
      } catch (e) {
        console.log("[RESPONSES] Failed to write logs:", e.message);
      }
    }
  };
}

/**
 * Create a stream pair that converts Chat Completions SSE to Responses API SSE
 * @param {Object} logger - Optional logger instance
 * @param {Object} options - Optional settings
 * @param {string[]|Set<string>} options.customToolNames - Tool names the client
 *   declared as `type: "custom"`. Calls to those tools are emitted as
 *   `custom_tool_call` items (not `function_call`) so strict clients like
 *   codex accept the payload (9router #4276).
 * @returns {{readable: ReadableStream, writable: WritableStream, whenClosed: Promise<void>}}
 */
export function createResponsesApiTransformStream(logger = null, options = {}) {
  const transform = createSSEStream({
    targetFormat: FORMATS.OPENAI, sourceFormat: FORMATS.OPENAI_RESPONSES,
    customToolNames: options.customToolNames,
    reqLogger: logger ? {
      appendProviderChunk(chunk) { logger.logInput(`bytes=${chunk.byteLength ?? chunk.length}`); },
      appendConvertedChunk(chunk) { logger.logOutput(chunk.trim()); },
    } : null,
  });
  if (logger) void transform.whenClosed.then(() => logger.flush());

  return transform;
}

