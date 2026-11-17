import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ fetch: vi.fn(), resolveProxy: vi.fn() }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: io.resolveProxy }));
vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));

import { POST } from "../../src/app/api/providers/validate/route.js";
import { testApiKeyConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";
import { validateFalApiKey } from "../../open-sse/services/falValidation.js";

const key = "synthetic-fal-validation-key";
const proxy = { strictProxy: true, vercelRelayUrl: "https://relay.example.test", connectionProxyEnabled: false,
  connectionProxyUrl: "", connectionNoProxy: "" };
beforeEach(() => { io.fetch.mockReset(); io.resolveProxy.mockResolvedValue(proxy); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function validate(mode) {
  if (mode === "saved") return testApiKeyConnection({ provider: "fal-ai", apiKey: key }, proxy);
  const response = await POST(new Request("http://localhost/api/providers/validate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "fal-ai", apiKey: key, proxyPoolId: "selected-pool" }),
  }));
  return response.json();
}

describe.each(["new", "saved"])("Fal %s connection validation", mode => {
  it.each([200, 201, 401, 403, 429, 500, 503])("requires a conclusive catalog auth response for HTTP %s", async status => {
    const cancel = vi.fn();
    io.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status }));
    const result = await validate(mode);
    expect(io.fetch).toHaveBeenCalledOnce();
    const [url, options, selectedProxy] = io.fetch.mock.calls[0];
    expect(url).toBe("https://api.fal.ai/v1/models?limit=1");
    expect(options.headers.Authorization).toBe(`Key ${key}`);
    expect(options.method || "GET").toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.body).toBeUndefined();
    expect(selectedProxy).toMatchObject(proxy);
    expect(result.valid).toBe(status >= 200 && status < 300);
    if (status === 401 || status === 403) expect(result.error).toBe("Invalid API key");
    else if (status >= 400) expect(result.error).toBe(`Unable to verify API key (Fal returned ${status})`);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("Fal validation request ownership", () => {
  it("does not dispatch after the caller already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("caller left before validation");
    controller.abort(reason);
    await expect(validateFalApiKey(key, io.fetch, { signal: controller.signal })).rejects.toBe(reason);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it.each(["caller", "deadline"])("settles on %s cancellation even if transport ignores abort and disposes a late response", async kind => {
    const caller = new AbortController();
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let deliver;
    io.fetch.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    const pending = validateFalApiKey(key, io.fetch, { signal: caller.signal });
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(8000);
    const reason = kind === "caller" ? new Error("caller left during validation")
      : new DOMException("validation deadline", "TimeoutError");
    const rejected = expect(pending).rejects.toBe(reason);
    (kind === "caller" ? caller : deadline).abort(reason);
    await rejected;
    const cancel = vi.fn();
    deliver(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
