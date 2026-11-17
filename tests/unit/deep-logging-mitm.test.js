import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const modules = ["../../src/mitm/handlers/base.js", "../../src/mitm/logger.js", "../../src/mitm/paths.js"];
let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "kitsune-deep-mitm-logs-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DEBUG_MITM", "1");
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const file of modules) delete require.cache[require.resolve(file)];
});
afterEach(async () => {
  for (const file of modules) delete require.cache[require.resolve(file)];
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("private MITM diagnostics", () => {
  it("does no log-directory I/O until a dump is actually requested", async () => {
    require("../../src/mitm/logger.js");
    expect(await readdir(directory)).toEqual([]);
  });

  it("redacts all credential header forms and retains only metadata with private file modes", async () => {
    const logger = require("../../src/mitm/logger.js");
    const file = logger.dumpRequest({ method: "POST", url: "/v1/chat?token=synthetic-query-canary", headers: { host: "example.invalid", authorization: "synthetic-auth-canary", password: "synthetic-password-canary", "x-session-id": "synthetic-session-canary", accept: "application/json" } }, Buffer.from("synthetic-private-prompt"));
    expect(file).toBeTruthy();
    const text = await readFile(file, "utf8");
    expect(text).not.toContain("synthetic-");
    expect(JSON.parse(text)).toMatchObject({ url: "/v1/chat", headers: { password: "[REDACTED]", "x-session-id": "[REDACTED]", accept: "application/json" }, body: { present: true } });
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("does not overwrite concurrent same-millisecond request metadata", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-11-17T00:00:00.000Z");
    const logger = require("../../src/mitm/logger.js");
    const req = { method: "POST", url: "/v1/chat", headers: { host: "example.invalid" } };
    const first = logger.dumpRequest(req, Buffer.from("first"));
    const second = logger.dumpRequest(req, Buffer.from("second"));
    expect(first).not.toBe(second);
    expect(await readFile(first, "utf8")).toContain('"bytes": 5');
    expect(await readFile(second, "utf8")).toContain('"bytes": 6');
  });

  it("clears only recognized metadata files and retains unrelated operator files", async () => {
    const logger = require("../../src/mitm/logger.js");
    const file = logger.dumpRequest({ method: "POST", url: "/v1/chat", headers: {} }, Buffer.from("metadata"));
    const notes = join(directory, "logs", "mitm", "operator-notes.txt");
    await writeFile(notes, "operator-owned notes");
    logger.clearDumpDir();
    expect(await readFile(notes, "utf8")).toBe("operator-owned notes");
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32")("does not traverse a dump-directory symlink during startup cleanup or writes", async () => {
    const outside = join(directory, "outside");
    await mkdir(outside);
    await mkdir(join(directory, "logs"));
    await writeFile(join(outside, "operator-state.txt"), "must survive");
    await symlink(outside, join(directory, "logs", "mitm"), "dir");
    const logger = require("../../src/mitm/logger.js");
    logger.clearDumpDir();
    expect(await readFile(join(outside, "operator-state.txt"), "utf8")).toBe("must survive");
    expect(logger.dumpRequest({ method: "POST", url: "/v1/chat", headers: {} }, Buffer.from("metadata"))).toBeNull();
    expect(await readdir(outside)).toEqual(["operator-state.txt"]);
  });

  it.each(["pipeTransformedSSE", "pipeTransformedEventStream"])("%s retains wire bytes without printing raw stream prefixes", async method => {
    const handler = require("../../src/mitm/handlers/base.js");
    const bytes = new TextEncoder().encode("synthetic-private-binary-canary");
    const writes = [];
    const res = { writeHead: vi.fn(), write: value => writes.push(Buffer.from(value)), end: vi.fn() };
    const response = new Response('data: {"content":"synthetic-private-sse-canary"}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
    await handler[method](response, res, value => value ? bytes : null, {});
    expect(Buffer.concat(writes)).toEqual(Buffer.from(bytes));
    const output = console.log.mock.calls.flat().join(" ");
    expect(output).not.toContain("synthetic-private-sse-canary");
    expect(output).not.toContain(Array.from(bytes.slice(0, 20)).join(","));
    expect(output).toContain("B)");
  });
});
