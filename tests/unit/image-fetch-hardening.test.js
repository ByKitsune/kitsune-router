import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DNS lookup so we control which host resolves to what IP.
const { lookupMock, fetchMock, dispatchers } = vi.hoisted(() => ({
  lookupMock: vi.fn(), fetchMock: vi.fn(), dispatchers: [],
}));
vi.mock("node:dns/promises", () => ({ lookup: (...a) => lookupMock(...a) }));
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetch: fetchMock, Agent: class extends actual.Agent {
    constructor(options) { super(options); dispatchers.push({ dispatcher: this, options }); }
  } };
});

import { fetchImageAsBase64 } from "../../open-sse/translator/concerns/image.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mockFetchOnce(bytes, ok = true) {
  const body = {
    getReader() {
      let sent = false;
      return {
        read: async () => sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(bytes) }),
        cancel: async () => {},
      };
    },
  };
  fetchMock.mockResolvedValueOnce({ ok, body });
}

beforeEach(() => {
  lookupMock.mockReset();
  fetchMock.mockReset();
  dispatchers.length = 0;
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]); // public by default
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("fetchImageAsBase64 hardening", () => {
  it("rejects non-http url", async () => {
    expect(await fetchImageAsBase64("ftp://x/y.png")).toBeNull();
    expect(await fetchImageAsBase64("data:image/png;base64,xx")).toBeNull();
  });

  it("SSRF: rejects private IP (10.x)", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    expect(await fetchImageAsBase64("http://internal.example/x.png")).toBeNull();
  });

  it("SSRF: rejects cloud metadata 169.254.169.254", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    expect(await fetchImageAsBase64("http://metadata/x.png")).toBeNull();
  });

  it("SSRF: rejects blocked hostname localhost", async () => {
    expect(await fetchImageAsBase64("http://localhost/x.png")).toBeNull();
  });

  it("SSRF: rejects IPv6 loopback", async () => {
    lookupMock.mockResolvedValue([{ address: "::1", family: 6 }]);
    expect(await fetchImageAsBase64("http://x/y.png")).toBeNull();
  });

  it.each([
    "::", "0:0:0:0:0:0:0:0", "::ffff:0:0", "::ffff:0.0.0.0",
    "0:0:0:0:0:ffff:0:0", "::ffff:7f00:1",
  ])("SSRF: rejects unspecified or mapped-private IPv6 %s before HTTP", async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 6 }]);
    mockFetchOnce(PNG);
    expect(await fetchImageAsBase64("https://images.example/a.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SSRF: rejects a mixed public/private FQDN answer before HTTP", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 }, { address: "::", family: 6 },
    ]);
    mockFetchOnce(PNG);
    expect(await fetchImageAsBase64("https://mixed.example/a.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not resolve DNS or download for an already-aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetchOnce(PNG);
    expect(await fetchImageAsBase64("https://images.example/a.png", { signal: controller.signal })).toBeNull();
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["caller", "deadline"])("settles during pending DNS on %s cancellation without a late download", async (cause) => {
    vi.useFakeTimers();
    let resolveDns;
    lookupMock.mockImplementationOnce(() => new Promise(resolve => { resolveDns = resolve; }));
    mockFetchOnce(PNG);
    const controller = new AbortController();
    let settled = false;
    const result = fetchImageAsBase64("https://images.example/a.png", {
      signal: controller.signal, timeoutMs: 40,
    }).then(value => { settled = true; return value; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      if (cause === "caller") controller.abort();
      await vi.advanceTimersByTimeAsync(cause === "deadline" ? 40 : 0);
      expect(settled).toBe(true);
      expect(await result).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      resolveDns([{ address: "93.184.216.34", family: 4 }]);
      await vi.advanceTimersByTimeAsync(0);
      await result;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one deadline for DNS and HTTP rather than restarting after DNS", async () => {
    vi.useFakeTimers();
    lookupMock.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve([
      { address: "93.184.216.34", family: 4 },
    ]), 30)));
    fetchMock.mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    let settled = false;
    const result = fetchImageAsBase64("https://images.example/a.png", { timeoutMs: 40 })
      .then(value => { settled = true; return value; });
    try {
      await vi.advanceTimersByTimeAsync(40);
      expect(settled).toBe(true);
      expect(await result).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await vi.advanceTimersByTimeAsync(40);
      await result;
    }
  });

  it("keeps downloads on direct Undici with validated addresses pinned to the socket", async () => {
    const proxyFetch = vi.fn(() => { throw new Error("global proxy must not download images"); });
    vi.stubGlobal("fetch", proxyFetch);
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockImplementationOnce(async (_url, init) => {
      expect(init.redirect).toBe("manual");
      const { options } = dispatchers.find(entry => entry.dispatcher === init.dispatcher);
      const pinned = await new Promise((resolve, reject) => options.connect.lookup("images.example", { all: true }, (error, records) => error ? reject(error) : resolve(records)));
      expect(pinned).toEqual([{ address: "93.184.216.34", family: 4 }]);
      return new Response(PNG);
    });
    expect(await fetchImageAsBase64("https://images.example/a.png")).toEqual({
      url: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/png",
    });
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("accepts valid PNG from public host", async () => {
    mockFetchOnce(PNG);
    const r = await fetchImageAsBase64("https://example.com/a.png");
    expect(r).not.toBeNull();
    expect(r.mimeType).toBe("image/png");
    expect(r.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("rejects disguised non-image payload (magic byte mismatch)", async () => {
    mockFetchOnce(Buffer.from("<?php system($_GET[c]); ?>"));
    expect(await fetchImageAsBase64("https://example.com/evil.png")).toBeNull();
  });

  it("rejects payload over size cap", async () => {
    mockFetchOnce(Buffer.alloc(1024));
    expect(await fetchImageAsBase64("https://example.com/big.png", { maxBytes: 100 })).toBeNull();
  });

  it("returns null when fetch not ok", async () => {
    mockFetchOnce(PNG, false);
    expect(await fetchImageAsBase64("https://example.com/404.png")).toBeNull();
  });
});
