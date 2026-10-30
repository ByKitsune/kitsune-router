import { afterEach, describe, expect, it, vi } from "vitest";
import { QoderService } from "../../src/lib/oauth/services/qoder.js";
import { QODER_CLI_USER_AGENT } from "../../open-sse/config/clientVersions.js";

afterEach(() => vi.unstubAllGlobals());

describe("Qoder's unsigned OpenAPI release identity", () => {
  it("uses the same published client identity for device polling and user-info", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: "synthetic-device-token", user_id: "synthetic-user", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ name: "Synthetic", email: "fixture@example.test" }));
    vi.stubGlobal("fetch", fetch);
    const service = new QoderService();
    expect(await service.pollDeviceToken({ nonce: "synthetic-nonce", codeVerifier: "synthetic-verifier" })).toMatchObject({ status: "ok" });
    expect(await service.fetchUserInfo("synthetic-device-token")).toMatchObject({ email: "fixture@example.test" });
    for (const [, options] of fetch.mock.calls) {
      const headers = new Headers(options.headers);
      expect(headers.get("user-agent")).toBe(QODER_CLI_USER_AGENT);
      expect(headers.has("cosy-signature")).toBe(false);
    }
    expect(QODER_CLI_USER_AGENT).toMatch(/^qoder\/\d+\.\d+\.\d+$/);
  });
});
