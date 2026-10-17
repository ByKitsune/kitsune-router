// Registry-declared image stripping must not forward unsupported image payloads.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { buildModelMatrix } from "./matrix.js";

// Base OpenAI-format request with text + tool + image (exercises strip + tool paths)
function baseBody(modelId) {
  return {
    model: modelId,
    stream: true,
    max_tokens: 64,
    messages: [
      { role: "system", content: "You are a helper." },
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
    ],
    tools: [
      { type: "function", function: { name: "get_time", description: "x", parameters: { type: "object", properties: {} } } },
    ],
  };
}


const stripModels = buildModelMatrix().filter((r) => r.strip.includes("image"));
describe.skipIf(stripModels.length === 0)("coverage: image-strip models drop image content", () => {
  it.each(stripModels)("$alias/$modelId strips image when strip=[image]", (row) => {
    const body = baseBody(row.modelId);
    const out = translateRequest(FORMATS.OPENAI, row.targetFormat, row.modelId, body, true, null, row.alias, null, row.strip);
    const json = JSON.stringify(out);
    expect(json).not.toContain("data:image/png");
  });
});
