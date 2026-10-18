import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { fetch as transportFetch } from "undici";
import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";

const vectors = new Map([
  ["first document", [0.1, 0.2, 0.3]],
  ["second document", [0.4, 0.5, 0.6]],
]);
let server;
let origin;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const copilot = req.headers["x-fixture-original-origin"] === "https://api.githubcopilot.com";
      const openai = req.headers["x-fixture-original-origin"] === "https://api.openai.com";
      const validRoute = copilot ? req.url === "/embeddings" : openai && req.url === "/v1/embeddings";
      const validAuth = req.headers.authorization === `Bearer ${copilot ? "synthetic-copilot-token" : "synthetic-openai-key"}`;
      const validProfile = !copilot || (req.headers["copilot-integration-id"] === "vscode-chat"
        && /^vscode\/\d/.test(req.headers["editor-version"] || "")
        && /^copilot-chat\/\d/.test(req.headers["editor-plugin-version"] || ""));
      const validInput = copilot ? Array.isArray(body.input) : typeof body.input === "string";
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const validBody = body.model === "text-embedding-3-small" && body.dimensions === 3
        && body.encoding_format === "float" && inputs.every((input) => typeof input === "string" && vectors.has(input));
      if (!validRoute || !validAuth || !validProfile || !validInput || !validBody) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Embedding transport contract rejected" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        object: "list",
        model: "text-embedding-3-small",
        data: inputs.map((input, index) => ({ object: "embedding", index, embedding: vectors.get(input) })),
        usage: { prompt_tokens: 4 * inputs.length, total_tokens: 4 * inputs.length },
      }));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  vi.stubGlobal("fetch", (url, init) => {
    const destination = new URL(url);
    const headers = new Headers(init?.headers);
    headers.set("x-fixture-original-origin", destination.origin);
    return transportFetch(`${origin}${destination.pathname}${destination.search}`, { ...init, headers });
  });
});

afterEach(() => vi.unstubAllGlobals());

async function embed(provider, input, credentials) {
  return handleEmbeddingsCore({
    body: { input, dimensions: 3, encoding_format: "float" },
    modelInfo: { provider, model: "text-embedding-3-small" },
    credentials,
  });
}

describe("Copilot embeddings HTTP contract", () => {
  it("accepts a scalar through the Copilot endpoint without sending the OAuth or unrelated API key", async () => {
    const result = await embed("github", "first document", {
      apiKey: "synthetic-unrelated-api-key",
      accessToken: "synthetic-oauth-token",
      copilotToken: "synthetic-copilot-token",
    });
    expect(result.response.status).toBe(200);
    expect((await result.response.json()).data).toEqual([
      { object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] },
    ]);
    expect(result.usage).toEqual({ prompt_tokens: 4, total_tokens: 4 });
  });

  it("uses a persisted Copilot service token instead of falling back to the OAuth token", async () => {
    const result = await embed("github", "first document", {
      accessToken: "synthetic-oauth-token",
      providerSpecificData: { copilotToken: "synthetic-copilot-token" },
    });
    expect(result.response.status).toBe(200);
    expect((await result.response.json()).data[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("preserves batch boundaries and ordering rather than wrapping an existing array", async () => {
    const result = await embed("github", ["first document", "second document"], { copilotToken: "synthetic-copilot-token" });
    expect(result.response.status).toBe(200);
    expect((await result.response.json()).data).toEqual([
      { object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] },
      { object: "embedding", index: 1, embedding: [0.4, 0.5, 0.6] },
    ]);
    expect(result.usage).toEqual({ prompt_tokens: 8, total_tokens: 8 });
  });

  it("keeps ordinary OpenAI scalar input and API-key authentication independent of Copilot", async () => {
    const result = await embed("openai", "first document", {
      apiKey: "synthetic-openai-key",
      copilotToken: "synthetic-copilot-token",
    });
    expect(result.response.status).toBe(200);
    expect((await result.response.json()).data[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });
});
