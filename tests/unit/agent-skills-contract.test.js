import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SKILLS, getSkillRawUrl, getSkillBlobUrl } from "@/shared/constants/skills.js";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const guide = (id) => read(`skills/${id}/SKILL.md`);
const blocks = (source) => [...source.matchAll(/^```(bash|js|json)\s*\n([\s\S]*?)^```/gm)]
  .map(([, language, code]) => ({ language, code }));

describe("published agent skills are usable without paid smoke calls", () => {
  it("keeps the dashboard, disk catalog and README links synchronized", () => {
    const directories = fs.readdirSync(path.join(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name).sort();
    expect(SKILLS.map(({ id }) => id).sort()).toEqual(directories);
    expect(new Set(SKILLS.map(({ id }) => id)).size).toBe(9);
    const index = read("skills/README.md");
    for (const { id } of SKILLS) {
      expect(index).toContain(getSkillRawUrl(id));
      expect(getSkillBlobUrl(id)).toBe(`https://github.com/ByKitsune/kitsune-router/blob/master/skills/${id}/SKILL.md`);
    }
  });

  for (const skill of SKILLS) {
    describe(skill.id, () => {
      it("has loadable identity, secure binding setup and a capability discovery path", () => {
        const source = guide(skill.id);
        expect(source.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---/)).not.toBeNull();
        expect(source.match(/^---\nname: ([^\n]+)/)?.[1]).toBe(skill.id);
        expect(source).toContain("KITSUNE_ROUTER_URL");
        expect(source).toContain("KITSUNE_ROUTER_KEY");
        expect(source).toContain("/v1/models");
        expect(source).not.toMatch(/\b(?:NINEROUTER|ZENROUTER)_(?:URL|KEY)\b/);
        if (!skill.isEntry) expect(source).toContain(getSkillRawUrl("kitsune-router"));
        if (skill.endpoint) {
          expect(source).toContain(skill.endpoint);
          const route = read(`src/app/api${skill.endpoint.replace(/\/\?$/, "")}/route.js`);
          expect(route).toMatch(/export (?:async )?function POST\(/);
        }
      });

      it("ships syntactically valid Bash, JavaScript and JSON examples", () => {
        const examples = blocks(guide(skill.id));
        expect(examples.length).toBeGreaterThan(0);
        for (const { language, code } of examples) {
          if (language === "json") {
            expect(() => JSON.parse(code)).not.toThrow();
            continue;
          }
          // Syntax checking only: no provider calls, file writes or credential reads.
          const check = language === "bash"
            ? spawnSync("bash", ["-n"], { input: code, encoding: "utf8", timeout: 5000 })
            : spawnSync(process.execPath, ["--input-type=module", "--check"], { input: code, encoding: "utf8", timeout: 5000 });
          expect(check.error, `${skill.id}: ${check.stderr}`).toBeUndefined();
          expect(check.status, `${skill.id}: ${check.stderr}`).toBe(0);
        }
      });

      it("bounds documented curl calls and propagates HTTP failure status", () => {
        const calls = blocks(guide(skill.id)).filter(({ language }) => language === "bash")
          .flatMap(({ code }) => code.replace(/\\\r?\n\s*/g, " ").split("\n"))
          .filter((line) => /\bcurl\s/.test(line));
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
          expect(call).toMatch(/--fail-with-body\b/);
          expect(call).toMatch(/--connect-timeout\s+\d+/);
          expect(call).toMatch(/--max-time\s+\d+/);
          expect(call).not.toMatch(/--insecure\b|(?:^|\s)-k(?:\s|$)|--retry\b/);
          // URLs are quoted, including the client's optional origin expansion.
          expect(call).toMatch(/"\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*)\/[^"\n]*"/);
        }
      });
    });
  }

  it.each([
    ["kitsune-router-chat", "messages"],
    ["kitsune-router-embeddings", "input"],
    ["kitsune-router-web-search", "query"],
    ["kitsune-router-web-fetch", "url"],
  ])("constructs valid %s request JSON without sending it upstream", (id, requiredField) => {
    const payloadCommands = blocks(guide(id)).filter(({ language }) => language === "bash")
      .map(({ code }) => code.replace(/\\\r?\n\s*/g, " ").match(/^([\s\S]*?\bjq\s+-n[\s\S]*?)\|\s*curl\b/)?.[1])
      .filter(Boolean);
    expect(payloadCommands.length).toBeGreaterThan(0);
    for (const command of payloadCommands) {
      const result = spawnSync("bash", ["-c", command], {
        // Only synthetic inputs are exposed to the shell; curl is excluded.
        env: {
          PATH: process.env.PATH,
          KITSUNE_ROUTER_MODEL: "fixture/selected-model",
          KITSUNE_ROUTER_FETCH_SELECTOR: "fixture-provider",
          KITSUNE_ROUTER_TARGET_URL: "https://example.com/article?q=one&lang=id",
        },
        encoding: "utf8", timeout: 5000,
      });
      expect(result.status, result.stderr).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.model).toBe(id === "kitsune-router-web-fetch" ? "fixture-provider" : "fixture/selected-model");
      expect(payload[requiredField]).toBeDefined();
      if (id === "kitsune-router-chat") {
        expect(payload.max_tokens).toBeGreaterThan(0);
        expect(payload.stream).toBe(false);
      }
    }
  });

  it("documents the fetch selector and direct response contract used by its handler", () => {
    const wrapper = read("src/sse/handlers/fetch.js");
    expect(wrapper).toContain("const providerInput = body.provider || body.model;");
    expect(wrapper).toContain("const providerId = resolveProviderId(providerInput);");
    expect(wrapper).toContain("JSON.stringify(result.data)");
    const source = guide("kitsune-router-web-fetch");
    expect(source).toContain("without `/fetch`");
    expect(source).toContain("not inside a `data` property");
    const response = blocks(source).find(({ language }) => language === "json");
    expect(JSON.parse(response.code)).toMatchObject({ content: { format: "markdown", text: expect.any(String), length: expect.any(Number) } });
    expect(source).not.toMatch(/const\s*\{\s*data\s*\}\s*=\s*await/);
  });

  it("keeps embeddings examples valid and treats dimensions as provider-specific", () => {
    const source = guide("kitsune-router-embeddings");
    const response = JSON.parse(blocks(source).find(({ language }) => language === "json").code);
    expect(response.data.map(({ index }) => index)).toEqual([0, 1]);
    expect(response.data.every(({ embedding }) => embedding.every(Number.isFinite))).toBe(true);
    expect(source).toContain("outputDimensionality");
    expect(read("open-sse/handlers/embeddingProviders/gemini.js")).toContain("outputDimensionality");
    expect(source).toContain("not proof");
  });
});
