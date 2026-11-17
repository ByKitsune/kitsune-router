import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const original = vi.hoisted(() => ({ fetch: globalThis.fetch, FormData: globalThis.FormData }));
import {
  createAccountTransport, getAccountRoutingPolicy, hasAccountProxyPolicy, isAccountRoutingFailure,
} from "../../open-sse/utils/accountTransport.js";
import { closeUpstreamPools } from "../../open-sse/utils/proxyFetch.js";

const servers = new Set();
const directAttempts = [];
const downstreamCalls = [];
let patchedFetch;

beforeEach(() => {
  patchedFetch = globalThis.fetch;
  directAttempts.length = 0;
  downstreamCalls.length = 0;
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  // The real proxy-aware transport must terminate at the original Node fetch.
  // A missing account route must never send fixture credentials to the internet.
  globalThis.fetch = (url, options) => {
    const target = new URL(String(url));
    if (target.hostname !== "127.0.0.1") {
      directAttempts.push(target.hostname);
      throw new Error("Unexpected direct account egress");
    }
    downstreamCalls.push({ url: String(url), options });
    return original.fetch(url, options);
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = patchedFetch;
  vi.unstubAllEnvs();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  servers.clear();
  expect(directAttempts).toEqual([]);
});
afterAll(async () => {
  await closeUpstreamPools({ timeoutMs: 100 });
  globalThis.fetch = original.fetch;
});

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function relay(label, requests) {
  return listen(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ label, target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
      authorization: request.headers.authorization, body: Buffer.concat(chunks).toString("utf8") });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ label }));
  });
}

describe("account transport captures request-local routing policy", () => {
  it("takes a frozen canonical snapshot without retaining mutable account metadata", () => {
    const credentials = { providerSpecificData: {
      connectionProxyEnabled: true, connectionProxyUrl: "http://first.invalid:8080",
      connectionNoProxy: "local.invalid", proxyPoolId: "first-pool", strictProxy: true,
    } };
    const transport = createAccountTransport(credentials);
    credentials.providerSpecificData.connectionProxyUrl = "http://replacement.invalid:8080";
    credentials.providerSpecificData.proxyPoolId = "replacement-pool";
    expect(transport.proxyOptions).toMatchObject({ connectionProxyUrl: "http://first.invalid:8080", proxyPoolId: "first-pool" });
    expect(Object.isFrozen(transport)).toBe(true);
    expect(Object.isFrozen(transport.proxyOptions)).toBe(true);
  });

  it("accepts legacy aliases while explicit canonical false disables a stale alias and URL", () => {
    expect(getAccountRoutingPolicy(null, { enabled: true, url: "http://proxy.invalid", noProxy: "internal.invalid" }))
      .toMatchObject({ connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid", connectionNoProxy: "internal.invalid" });
    const policy = getAccountRoutingPolicy({ providerSpecificData: {
      connectionProxyEnabled: false, enabled: true, connectionProxyUrl: "http://unused.invalid", proxyPoolId: "__none__",
    } });
    expect(policy.connectionProxyEnabled).toBe(false);
    expect(policy.proxyPoolId).toBeNull();
    expect(hasAccountProxyPolicy(policy)).toBe(false);
  });

  it.each([
    { connectionProxyEnabled: true }, { proxyPoolId: "selected-pool" },
    { strictProxy: true }, { vercelRelayUrl: "https://relay.invalid" },
  ])("recognizes an active or unresolved account route: %j", source => {
    expect(hasAccountProxyPolicy(getAccountRoutingPolicy({ providerSpecificData: source }))).toBe(true);
  });

  it("keeps two concurrent accounts on their own real relays after metadata mutation", async () => {
    const requests = [];
    const [firstRelay, secondRelay] = await Promise.all([relay("first", requests), relay("second", requests)]);
    const first = { providerSpecificData: { vercelRelayUrl: firstRelay, strictProxy: true } };
    const second = { providerSpecificData: { vercelRelayUrl: secondRelay, strictProxy: true } };
    const firstTransport = createAccountTransport(first);
    const secondTransport = createAccountTransport(second);
    first.providerSpecificData.vercelRelayUrl = secondRelay;
    second.providerSpecificData.vercelRelayUrl = firstRelay;
    const responses = await Promise.all([
      firstTransport.fetch("https://first-account.invalid/v1/images?mode=generate", {
        method: "POST", headers: { Authorization: "Bearer synthetic-first-account" }, body: "first body",
      }),
      secondTransport.fetch("https://second-account.invalid/v1/audio", {
        method: "POST", headers: { Authorization: "Bearer synthetic-second-account" }, body: "second body",
      }),
    ]);
    expect(await Promise.all(responses.map(response => response.json()))).toEqual([{ label: "first" }, { label: "second" }]);
    expect(requests).toEqual(expect.arrayContaining([
      { label: "first", target: "https://first-account.invalid", path: "/v1/images?mode=generate", authorization: "Bearer synthetic-first-account", body: "first body" },
      { label: "second", target: "https://second-account.invalid", path: "/v1/audio", authorization: "Bearer synthetic-second-account", body: "second body" },
    ]));
    expect(requests).toHaveLength(2);
  });

  it("rejects a missing strict pool before any direct or relay request", async () => {
    const transport = createAccountTransport({ providerSpecificData: { proxyPoolId: "missing-pool", strictProxy: true } });
    const error = await transport.fetch("https://provider.invalid/private?token=synthetic-secret", {
      headers: { Authorization: "Bearer synthetic-secret" },
    }).catch(error => error);
    expect(isAccountRoutingFailure(error)).toBe(true);
    expect(error.message).toContain("strictProxy=true");
    expect(error.message).not.toContain("synthetic-secret");
    expect(downstreamCalls).toHaveLength(0);
  });

  it("retains the legacy pool selection and refuses direct egress even without strict mode", async () => {
    const transport = createAccountTransport({ providerSpecificData: { connectionProxyPoolId: "missing-legacy-pool" } });
    const error = await transport.fetch("https://provider.invalid/private", {
      headers: { Authorization: "Bearer synthetic-legacy-account" },
    }).catch(error => error);
    expect(isAccountRoutingFailure(error)).toBe(true);
    expect(error.message).toContain("direct egress is disabled");
    expect(downstreamCalls).toHaveLength(0);
  });

  it("lets an explicit canonical no-pool selection override a stale legacy pool", async () => {
    const requests = [];
    const endpoint = await listen((request, response) => {
      requests.push(request.url);
      response.end("explicit direct account");
    });
    const transport = createAccountTransport({ providerSpecificData: {
      proxyPoolId: "__none__", connectionProxyPoolId: "stale-legacy-pool",
    } });
    expect(transport.proxyOptions.proxyPoolId).toBeNull();
    expect(hasAccountProxyPolicy(transport.proxyOptions)).toBe(false);
    expect(await (await transport.fetch(endpoint)).text()).toBe("explicit direct account");
    expect(requests).toEqual(["/"]);
  });

  it("keeps a resolved legacy pool on its strict relay with the selected account proof", async () => {
    const requests = [];
    const endpoint = await relay("legacy-pool", requests);
    const transport = createAccountTransport({ providerSpecificData: {
      connectionProxyPoolId: "legacy-pool", strictProxy: true, vercelRelayUrl: endpoint,
    } });
    expect(transport.proxyOptions.proxyPoolId).toBe("legacy-pool");
    expect(hasAccountProxyPolicy(transport.proxyOptions)).toBe(true);
    const response = await transport.fetch("https://provider.invalid/v1/video", {
      headers: { Authorization: "Bearer synthetic-legacy-account" },
    });
    expect(await response.json()).toEqual({ label: "legacy-pool" });
    expect(requests).toEqual([{
      label: "legacy-pool", target: "https://provider.invalid", path: "/v1/video",
      authorization: "Bearer synthetic-legacy-account", body: "",
    }]);
  });

  it("keeps a broken credential-bearing relay URL out of transport diagnostics", async () => {
    const transport = createAccountTransport({ providerSpecificData: {
      vercelRelayUrl: "http://synthetic-user:synthetic-secret@127.0.0.1:1", strictProxy: true,
    } });
    const error = await transport.fetch("https://provider.invalid/private?token=synthetic-secret").catch(error => error);
    expect(isAccountRoutingFailure(error)).toBe(true);
    expect(error.message).toContain("direct egress is disabled");
    expect(String(error)).not.toMatch(/synthetic-secret|synthetic-user|provider\.invalid/);
    expect(error.cause).toBeUndefined();
  });
});

describe("account transport cancellation and native body compatibility", () => {
  it("rejects an already-cancelled caller or deadline before starting transport", () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    const callerReason = new Error("synthetic caller abort");
    const deadlineReason = new Error("synthetic expired deadline");
    caller.abort(callerReason);
    deadline.abort(deadlineReason);
    expect(() => createAccountTransport(null, { signal: caller.signal }).fetch("https://provider.invalid"))
      .toThrow(callerReason);
    expect(() => createAccountTransport(null).fetch("https://provider.invalid", { signal: deadline.signal }))
      .toThrow(deadlineReason);
    expect(downstreamCalls).toHaveLength(0);
  });

  it.each(["caller", "deadline"])("retains the %s abort when composing both live signals", async selected => {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const endpoint = await listen((_request, response) => {
      response.on("error", () => {});
      started();
    });
    const caller = new AbortController();
    const deadline = new AbortController();
    const pending = createAccountTransport(null, { signal: caller.signal }).fetch(endpoint, { signal: deadline.signal });
    await ready;
    const reason = new Error(`synthetic ${selected} abort`);
    (selected === "caller" ? caller : deadline).abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect((selected === "caller" ? deadline : caller).signal.aborted).toBe(false);
  });

  it("cancels polling sleep promptly without waiting for another provider request", async () => {
    const caller = new AbortController();
    const transport = createAccountTransport(null, { signal: caller.signal });
    const pending = transport.sleep(60000);
    const reason = new Error("synthetic polling cancellation");
    caller.abort(reason);
    await expect(pending).rejects.toMatchObject({ name: "AbortError", cause: reason });
    expect(downstreamCalls).toHaveLength(0);
  });

  it("preserves native FormData multipart serialization through the real fetch boundary", async () => {
    let observed;
    const endpoint = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      observed = { type: request.headers["content-type"], body: Buffer.concat(chunks) };
      response.end("accepted");
    });
    const bytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0xff, 0x00]);
    const form = new original.FormData();
    form.append("model", "synthetic-transcription");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "voice.wav");
    const response = await createAccountTransport(null).fetch(endpoint, { method: "POST", body: form });
    expect(await response.text()).toBe("accepted");
    expect(globalThis.FormData).toBe(original.FormData);
    expect(observed.type).toMatch(/^multipart\/form-data;\s*boundary=/);
    expect(observed.body.includes(Buffer.from(bytes))).toBe(true);
    expect(observed.body.toString("latin1")).toContain('name="model"');
    expect(observed.body.toString("latin1")).toContain('filename="voice.wav"');
    expect(observed.body.toString("latin1")).not.toBe("[object FormData]");
  });
});

describe("account transport refuses credential-bearing redirects", () => {
  it.each([301, 302, 303, 307, 308])("does not forward x-key or a private request body to a second origin after HTTP %i", async status => {
    const redirected = [];
    const received = [];
    const destination = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      redirected.push({ key: request.headers["x-key"], body: Buffer.concat(chunks).toString("utf8") });
      response.end("unexpected redirect target");
    });
    const endpoint = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received.push({ key: request.headers["x-key"], body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(status, { Location: `${destination}/other-origin?token=synthetic-location-secret` });
      response.end("redirect refused");
    });
    const error = await createAccountTransport(null).fetch(endpoint, {
      method: "POST", headers: { "x-key": "synthetic-api-secret" },
      body: "synthetic-private-request-body", redirect: "follow",
    }).catch(error => error);
    expect(error).toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
    expect(isAccountRoutingFailure(error)).toBe(true);
    expect(String(error)).not.toMatch(/synthetic-api-secret|synthetic-private-request-body|synthetic-location-secret|127\.0\.0\.1/);
    expect(received).toEqual([{ key: "synthetic-api-secret", body: "synthetic-private-request-body" }]);
    expect(redirected).toEqual([]);
    expect(downstreamCalls).toHaveLength(1);
    expect(downstreamCalls[0].options.redirect).toBe("manual");
  });

  it("also refuses a same-origin redirect so configured APIs must use their canonical URL", async () => {
    const paths = [];
    const endpoint = await listen((request, response) => {
      paths.push(request.url);
      if (request.url === "/canonical") response.end("unexpected canonical fetch");
      else {
        response.writeHead(302, { Location: "/canonical" });
        response.end("same-origin redirect");
      }
    });
    await expect(createAccountTransport(null).fetch(endpoint, { headers: { "x-key": "synthetic-api-secret" } }))
      .rejects.toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
    expect(paths).toEqual(["/"]);
  });

  it.each([200, 302])("preserves caller cancellation after real HTTP %i headers arrive", async status => {
    const endpoint = await listen((_request, response) => {
      response.writeHead(status, { "Content-Type": "text/plain", Location: "/must-not-follow" });
      response.flushHeaders();
      response.write("partial body held open");
    });
    const caller = new AbortController();
    const reason = new Error("synthetic cancellation after headers");
    const boundary = globalThis.fetch;
    let cancel;
    globalThis.fetch = async (url, options) => {
      const response = await boundary(url, options);
      cancel = vi.spyOn(response.body, "cancel");
      caller.abort(reason);
      return response;
    };
    await expect(createAccountTransport(null, { signal: caller.signal }).fetch(endpoint)).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(downstreamCalls).toHaveLength(1);
  });

  it("does not wait for an upstream redirect body's cancellation acknowledgement", async () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    globalThis.fetch = async () => ({ status: 307, body: { cancel } });
    const pending = createAccountTransport(null).fetch("http://127.0.0.1/synthetic-fetch-boundary");
    let timeout;
    try {
      const outcome = await Promise.race([
        pending.catch(error => error),
        new Promise(resolve => { timeout = setTimeout(() => resolve("cancellation acknowledgement blocked the caller"), 500); }),
      ]);
      expect(outcome).toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally { clearTimeout(timeout); }
  });
});
