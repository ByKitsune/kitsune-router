import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const transport = vi.hoisted(() => ({ native: globalThis.fetch }));
vi.hoisted(() => {
  globalThis.fetch = (url, options) => new URL(url).hostname === "127.0.0.1"
    ? transport.native(url, options) : Promise.reject(new Error("fixture forbids direct egress"));
});
import * as providers from "../../open-sse/services/tokenRefresh.js";
import { refreshProviderCredentials } from "../../open-sse/services/oauthCredentialManager.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { KiroExecutor } from "../../open-sse/executors/kiro.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";

let sequence = 0;
const servers = [];
async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(() => { globalThis.fetch = transport.native; });
const cases = [
  ["Codex provider", (token, policy, signal) => providers.refreshCodexToken(token, null, policy, signal)],
  ["Google provider", (token, policy, signal) => providers.refreshGoogleToken(token, "fixture-client", "fixture-secret", null, policy, signal)],
  ["Claude provider", (token, policy, signal) => providers.refreshClaudeOAuthToken(token, null, policy, signal)],
  ["Kimi provider", (token, policy, signal) => providers.refreshKimiToken(token, {}, null, policy, signal)],
  ["Cline provider", (token, policy, signal) => providers.refreshClineToken(token, null, policy, signal)],
  ["Copilot provider", (token, policy, signal) => providers.refreshCopilotToken(token, null, policy, signal)],
  ["iFlow provider", (token, policy, signal) => providers.refreshIflowToken(token, null, policy, signal)],
  ["GitHub provider", (token, policy, signal) => providers.refreshGitHubToken(token, null, policy, signal)],
  ["CodeBuddy provider", (token, policy, signal) => providers.refreshCodebuddyToken(token, null, policy, signal)],
  ["CodeBuddy Intl provider", (token, policy, signal) => providers.refreshCodebuddyIntlToken(token, null, policy, signal)],
  ["Kiro provider", (token, policy, signal) => providers.refreshKiroToken(token, { profileArn: "fixture-profile" }, null, policy, signal)],
  ["public token dispatcher", (token, policy, signal) => providers.refreshTokenByProvider("codex", { refreshToken: token }, null, policy, signal)],
  ["access token dispatcher", (token, policy, signal) => providers.getAccessToken("codex", { refreshToken: token }, null, policy, signal)],
  ["credential manager", (token, policy, signal) => refreshProviderCredentials("codex", { refreshToken: token, connectionId: token }, null, policy, signal)],
  ["Codex executor", (token, policy, signal) => new CodexExecutor().refreshCredentials({ refreshToken: token, connectionId: token }, null, policy, signal)],
  ["Gemini CLI executor", (token, policy, signal) => new GeminiCLIExecutor().refreshCredentials({ refreshToken: token }, null, policy, signal)],
  ["Antigravity executor", (token, policy, signal) => new AntigravityExecutor().refreshCredentials({ refreshToken: token }, null, policy, signal)],
  ["Kiro executor", (token, policy, signal) => new KiroExecutor().refreshCredentials({ refreshToken: token, providerSpecificData: { profileArn: "fixture" } }, null, policy, signal)],
  ["GitHub executor", (token, policy, signal) => new GithubExecutor().refreshCredentials({ accessToken: token, refreshToken: token }, null, policy, signal)],
];

describe.each(cases)("%s cancellation", (_name, invoke) => {
  it("closes an abandoned refresh socket and rejects with the caller's ordinary Error", async () => {
    let started;
    let closed;
    const entered = new Promise(resolve => { started = resolve; });
    const disconnected = new Promise(resolve => { closed = resolve; });
    const policy = await listen(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      res.on("close", closed);
      started();
    });
    const caller = new AbortController();
    const pending = invoke(`refresh-${++sequence}`, policy, caller.signal).then(value => value, error => error);
    await entered;
    const reason = new Error("caller left refresh");
    caller.abort(reason);
    const outcome = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("kept waiting"), 200))]);
    const wasClosed = await Promise.race([disconnected.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 200))]);
    expect(outcome).toBe(reason);
    expect(wasClosed).toBe(true);
  });
});

it("allows a second Codex waiter to receive the rotation without cancelling its shared transport", async () => {
  let started;
  let finish;
  let count = 0;
  const entered = new Promise(resolve => { started = resolve; });
  const policy = await listen(async (req, res) => {
    for await (const _chunk of req) { /* drain */ }
    count++;
    finish = () => res.end('{"access_token":"fresh","refresh_token":"rotated","expires_in":3600}');
    started();
  });
  const credentials = { connectionId: `connection-${++sequence}`, refreshToken: `token-${sequence}` };
  const caller = new AbortController();
  const first = refreshProviderCredentials("codex", credentials, null, policy, caller.signal).then(value => value, error => error);
  const second = refreshProviderCredentials("codex", credentials, null, policy);
  await entered;
  const reason = new Error("only first caller left");
  caller.abort(reason);
  const firstResult = await Promise.race([first, new Promise(resolve => setTimeout(() => resolve("kept waiting"), 200))]);
  finish();
  expect(await second).toMatchObject({ accessToken: "fresh", refreshToken: "rotated" });
  expect(firstResult).toBe(reason);
  expect(count).toBe(1);
});
