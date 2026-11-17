import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { exportPKCS8, generateKeyPair } from "jose";

const route = vi.hoisted(() => ({ url: "" }));
vi.mock("../../open-sse/config/appConstants.js", async importOriginal => {
  const actual = await importOriginal();
  const endpoints = { ...actual.OAUTH_ENDPOINTS };
  for (const provider of ["anthropic", "openai", "google", "github", "iflow"]) {
    endpoints[provider] = { ...endpoints[provider], get token() { return route.url; } };
  }
  return { ...actual, OAUTH_ENDPOINTS: endpoints };
});
vi.mock("../../open-sse/config/providers.js", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    PROVIDERS: {
      ...actual.PROVIDERS,
      cline: { ...actual.PROVIDERS.cline, get refreshUrl() { return route.url; } },
      kimi: { ...actual.PROVIDERS.kimi, get refreshUrl() { return route.url; } },
    },
    PROVIDER_OAUTH: {
      ...actual.PROVIDER_OAUTH,
      github: { ...actual.PROVIDER_OAUTH.github, get copilotTokenUrl() { return route.url; } },
      "codebuddy-cn": { ...actual.PROVIDER_OAUTH["codebuddy-cn"], get refreshUrl() { return route.url; } },
      "codebuddy-intl": { ...actual.PROVIDER_OAUTH["codebuddy-intl"], get refreshUrl() { return route.url; } },
      trae: { ...actual.PROVIDER_OAUTH.trae, get exchangeTokenUrl() { return route.url; } },
    },
  };
});
import * as refresh from "../../open-sse/services/tokenRefresh.js";

let key;
let sequence = 0;
const servers = [];
const listen = async handler => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
beforeAll(async () => { key = await exportPKCS8((await generateKeyPair("RS256", { extractable: true })).privateKey); });
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(async () => {
  const { closeUpstreamPools } = await import("../../open-sse/utils/proxyFetch.js");
  await closeUpstreamPools();
});

const cases = [
  ["Claude", token => refresh.refreshClaudeOAuthToken(token)],
  ["Kimi", token => refresh.refreshKimiToken(token, {})],
  ["iFlow", token => refresh.refreshIflowToken(token)],
  ["GitHub", token => refresh.refreshGitHubToken(token)],
  ["Cline", token => refresh.refreshClineToken(token)],
  ["Codex", token => refresh.refreshCodexToken(token)],
  ["Copilot", token => refresh.refreshCopilotToken(token)],
  ["CodeBuddy CN", token => refresh.refreshCodebuddyToken(token)],
  ["CodeBuddy Intl", token => refresh.refreshCodebuddyIntlToken(token)],
  ["Trae", token => refresh.refreshTraeToken(token, {})],
  ["Vertex", token => refresh.refreshVertexToken({ client_email: `${token}@example.invalid`, project_id: "synthetic-project", private_key: key })],
  ["Google existing guard", token => refresh.refreshGoogleToken(token, "synthetic-client", "synthetic-secret")],
];

describe.each(cases)("%s grant redirects", (_name, invoke) => {
  it.each([[307, false], [308, false], [307, true], [308, true]])("refuses HTTP%s (cross origin: %s) before another endpoint receives the proof", async (status, crossOrigin) => {
    const received = [];
    let intendedRequests = 0;
    let second;
    const handler = async (req, res) => {
      if (req.url === "/source") {
        intendedRequests++;
        for await (const _chunk of req) { /* Drain only the intended grant request. */ }
        res.writeHead(status, { Location: `${second}/target` });
        res.end();
      } else {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        received.push({ method: req.method, bytes: Buffer.concat(chunks).byteLength, headers: req.headers });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ access_token: "synthetic-access", refresh_token: "synthetic-rotated", expires_in: 3600, token: "synthetic-access", code: 0, data: { accessToken: "synthetic-access" }, Result: { AccessToken: "synthetic-access" } }));
      }
    };
    const source = await listen(handler);
    second = crossOrigin ? await listen(handler) : source;
    route.url = `${source}/source`;
    try { await invoke(`synthetic-proof-${++sequence}`); }
    catch (error) { expect(error.cause?.message).toBe("unexpected redirect"); }
    expect(intendedRequests).toBe(1);
    expect(received).toEqual([]);
  });
});
