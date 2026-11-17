import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import claude from "../../src/lib/oauth/providers/claude.js";
import codex from "../../src/lib/oauth/providers/codex.js";
import gemini from "../../src/lib/oauth/providers/gemini-cli.js";
import antigravity from "../../src/lib/oauth/providers/antigravity.js";
import iflow from "../../src/lib/oauth/providers/iflow.js";
import gitlab from "../../src/lib/oauth/providers/gitlab.js";
import xai from "../../src/lib/oauth/providers/xai.js";
import kimi from "../../src/lib/oauth/providers/kimi.js";
import github from "../../src/lib/oauth/providers/github.js";
import grok from "../../src/lib/oauth/providers/grok-cli.js";
import kimchi from "../../src/lib/oauth/providers/kimchi.js";
import kilocode from "../../src/lib/oauth/providers/kilocode.js";
import { OAuthService } from "../../src/lib/oauth/services/oauth.js";
import { XaiService } from "../../src/lib/oauth/services/xai.js";

const servers = [];
const listen = async handler => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(async () => { const { closeUpstreamPools } = await import("../../open-sse/utils/proxyFetch.js"); await closeUpstreamPools(); });
const config = source => ({ tokenUrl: `${source}/source`, deviceCodeUrl: `${source}/source`, validationUrl: `${source}/source`, clientId: "synthetic-client", clientSecret: "synthetic-client-secret" });
const codeCases = [["Claude", claude], ["Codex", codex], ["Gemini", gemini], ["Antigravity", antigravity], ["iFlow", iflow], ["xAI", xai]]
  .map(([name, provider]) => [`${name} code exchange`, source => provider.exchangeToken(config(source), "synthetic-code", "http://127.0.0.1/callback", "synthetic-verifier", "synthetic-state")]);
const cases = [
  ...codeCases,
  ["GitLab code exchange", source => gitlab.exchangeToken({ tokenUrlPath: "/source", userInfoUrlPath: "/user" }, "synthetic-code", "http://127.0.0.1/callback", "synthetic-verifier", "synthetic-state", { baseUrl: source, clientId: "synthetic-client", clientSecret: "synthetic-client-secret" })],
  ["generic CLI code exchange", source => new OAuthService(config(source)).exchangeCode("synthetic-code", "http://127.0.0.1/callback", "synthetic-verifier")],
  ["xAI CLI code exchange", source => new XaiService().exchangeXaiCode({ tokenUrl: `${source}/source`, code: "synthetic-code", codeVerifier: "synthetic-verifier", redirectUri: "http://127.0.0.1/callback" })],
  ["Kimi device poll", source => kimi.pollToken(config(source), "synthetic-device-code")],
  ["GitHub device poll", source => github.pollToken(config(source), "synthetic-device-code")],
  ["Grok device poll", source => grok.pollToken(config(source), "synthetic-device-code")],
  ["Kilo URL-proof poll", source => kilocode.pollToken({ pollUrlBase: `${source}/source` }, "synthetic-device-code")],
  ["Kimchi authenticated profile", source => kimchi.exchangeToken(config(source), "synthetic-access-proof")],
];

describe.each(cases)("%s initial OAuth redirects", (_name, invoke) => {
  it.each([[307, false], [308, false], [307, true], [308, true]])("refuses HTTP%s (cross origin: %s) without forwarding proofs", async (status, crossOrigin) => {
    let intended = 0;
    let forwarded = 0;
    let target;
    const handler = async (req, res) => {
      for await (const _chunk of req) { /* All values are synthetic, never print bodies. */ }
      if (req.url.startsWith("/source")) {
        intended++;
        res.writeHead(status, { Location: `${target}/target` });
        res.end();
      } else {
        forwarded++;
        res.setHeader("content-type", "application/json");
        res.end('{"access_token":"synthetic-access","refresh_token":"synthetic-refresh","expires_in":3600}');
      }
    };
    const source = await listen(handler);
    target = crossOrigin ? await listen(handler) : source;
    try { await invoke(source); }
    catch (error) { expect(error.cause?.message).toBe("unexpected redirect"); }
    expect(intended).toBe(1);
    expect(forwarded).toBe(0);
  });
});
