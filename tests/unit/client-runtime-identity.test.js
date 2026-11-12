import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("os"); vi.resetModules(); });

describe("client runtime metadata describes the gateway host", () => {
  it.each([
    ["linux", "x64", "linux; x86_64"],
    ["darwin", "arm64", "macos; aarch64"],
    ["win32", "x64", "windows; x86_64"],
  ])("derives the Grok and Kiro wire metadata on %s/%s", async (os, cpu, grokHost) => {
    vi.resetModules();
    vi.doMock("os", () => ({ platform: () => os, arch: () => cpu, release: () => "fixture-kernel-release" }));
    const versions = await import("../../open-sse/config/clientVersions.js");
    expect(versions.GROK_CLI_USER_AGENT).toBe(`grok-pager/1.0.77 grok-shell/1.0.77 (${grokHost})`);
    expect(versions.KIRO_FINGERPRINT({ machineId: "caller-machine" })).toEqual({
      userAgent: `aws-sdk-js/3.0.0 ua/2.1 os/${os}#fixture-kernel-release lang/js md/nodejs#${process.versions.node} api/codewhispererruntime#3.0.0 m/N,E KiroIDE-1.4.154-caller-machine`,
      amzUserAgent: "aws-sdk-js/3.0.0 KiroIDE-1.4.154-caller-machine",
    });
    expect(versions.KIRO_FINGERPRINT({ kiroAgentOs: "caller-os", kiroAgentOsVersion: "caller-release", kiroNodeVersion: "caller-runtime", machineId: "caller-machine" }).userAgent)
      .toBe("aws-sdk-js/3.0.0 ua/2.1 os/caller-os#caller-release lang/js md/nodejs#caller-runtime api/codewhispererruntime#3.0.0 m/N,E KiroIDE-1.4.154-caller-machine");
  });
});
