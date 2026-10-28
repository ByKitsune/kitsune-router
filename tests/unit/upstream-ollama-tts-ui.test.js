import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import * as providers from "../../src/shared/constants/providers.js";
import * as models from "../../src/shared/constants/models.js";
import * as ttsModels from "../../open-sse/config/ttsModels.js";
import { TTS_PROVIDER_CONFIG } from "../../src/shared/constants/ttsProviders.js";
import { GOOGLE_TTS_LANGUAGES } from "../../open-sse/config/googleTtsLanguages.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/TtsExampleCard.js", import.meta.url));
const compiled = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Small hook harness executes the real component and its event handlers without
// starting an application server or installing a browser/DOM package.
function fixture() {
  const slots = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useEffect() {},
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const blobs = [];
  const fetch = vi.fn();
  const fixtureModule = { exports: {} };
  const placeholders = () => null;
  vm.runInNewContext(compiled, {
    module: fixtureModule, exports: fixtureModule.exports, console, Blob, Uint8Array, atob,
    URL: { createObjectURL: (blob) => { blobs.push(blob); return `blob:fixture-${blobs.length}`; }, revokeObjectURL() {} },
    fetch,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (id === "@/shared/components") return { Card: placeholders };
      if (id === "@/shared/constants/providers") return providers;
      if (id === "@/shared/constants/models") return models;
      if (id === "@/shared/constants/ttsProviders") return { TTS_PROVIDER_CONFIG };
      if (id === "@/shared/hooks/useCopyToClipboard") return { useCopyToClipboard: () => ({ copied: false, copy() {} }) };
      if (id === "@/i18n/runtime") return { translate: (value) => value };
      if (id === "open-sse/config/ttsModels.js") return ttsModels;
      if (id === "open-sse/config/googleTtsLanguages.js") return { GOOGLE_TTS_LANGUAGES };
      if (id === "./exampleShared") return { Row: placeholders };
      throw new Error(`Unexpected fixture import: ${id}`);
    },
  }, { filename });
  return {
    fetch, blobs,
    render(providerId = "ollama-local") { cursor = 0; return fixtureModule.exports.TtsExampleCard({ providerId }); },
  };
}

function findAll(tree, predicate, results = []) {
  if (Array.isArray(tree)) { for (const node of tree) findAll(node, predicate, results); }
  else if (tree && typeof tree === "object") {
    if (predicate(tree)) results.push(tree);
    findAll(tree.props?.children, predicate, results);
  }
  return results;
}
const find = (tree, predicate) => findAll(tree, predicate)[0];
const outputSelect = (tree) => find(tree, (node) => node.type === "select" && node.props["aria-label"] === "Output format");
const runButton = (tree) => find(tree, (node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Run"));

describe("Ollama TTS example card", () => {
  it("offers WAV, PCM and JSON with a WAV default and an accurate curl request", () => {
    const view = fixture();
    const tree = view.render();
    const select = outputSelect(tree);
    expect(select.props.value).toBe("wav");
    expect(findAll(select, (node) => node.type === "option").map((node) => node.props.value)).toEqual(["wav", "pcm", "json"]);
    const request = findAll(tree, (node) => node.type === "pre")[0].props.children;
    expect(request).toContain("?response_format=wav");
    expect(request).toContain("--output speech.wav");
    expect(request).not.toContain("speech.mp3");
  });

  it("requests raw PCM and offers the untouched bytes as a download, not fake browser playback", async () => {
    const view = fixture();
    let tree = view.render();
    outputSelect(tree).props.onChange({ target: { value: "pcm" } });
    tree = view.render();
    const bytes = Uint8Array.from([0, 1, 255, 2]);
    view.fetch.mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "audio/pcm" } }));
    await runButton(tree).props.onClick();
    tree = view.render();
    expect(view.fetch.mock.calls[0][0]).toBe("/api/v1/audio/speech?response_format=pcm");
    expect(find(tree, (node) => node.type === "a" && node.props.download === "speech.pcm")).toBeTruthy();
    expect(find(tree, (node) => node.type === "audio")).toBeUndefined();
    expect(new Uint8Array(await view.blobs[0].arrayBuffer())).toEqual(bytes);
  });

  it("requests the JSON envelope and downloads and previews its decoded WAV bytes", async () => {
    const view = fixture();
    let tree = view.render();
    outputSelect(tree).props.onChange({ target: { value: "json" } });
    tree = view.render();
    const request = findAll(tree, (node) => node.type === "pre")[0].props.children;
    expect(request).toContain("?response_format=json");
    expect(request).not.toContain("--output");
    expect(request.trimEnd().endsWith("\\")).toBe(false);
    view.fetch.mockResolvedValueOnce(Response.json({ audio: "AAH/Ag==", format: "wav" }));
    await runButton(tree).props.onClick();
    tree = view.render();
    expect(view.fetch).toHaveBeenCalledOnce();
    expect(view.fetch.mock.calls[0][0]).toBe("/api/v1/audio/speech?response_format=json");
    expect(find(tree, (node) => node.type === "a" && node.props.download === "speech.wav")).toBeTruthy();
    expect(find(tree, (node) => node.type === "audio")).toBeTruthy();
    expect(new Uint8Array(await view.blobs[0].arrayBuffer())).toEqual(Uint8Array.from([0, 1, 255, 2]));
  });

  it("reports an invalid JSON response rather than claiming an audio result", async () => {
    const view = fixture();
    let tree = view.render();
    outputSelect(tree).props.onChange({ target: { value: "json" } });
    tree = view.render();
    view.fetch.mockResolvedValueOnce(Response.json({ format: "wav" }));
    await runButton(tree).props.onClick();
    tree = view.render();
    expect(find(tree, (node) => node.props.role === "alert").props.children).toContain("did not contain base64 audio");
    expect(find(tree, (node) => node.type === "audio")).toBeUndefined();
  });

  it("resets model and format to the new provider rather than retaining PCM", () => {
    const view = fixture();
    let tree = view.render();
    outputSelect(tree).props.onChange({ target: { value: "pcm" } });
    tree = view.render("openai");
    expect(outputSelect(tree).props.value).toBe("mp3");
    expect(findAll(outputSelect(tree), (node) => node.type === "option").map((node) => node.props.value)).toEqual(["mp3", "json"]);
    expect(findAll(tree, (node) => node.type === "pre")[0].props.children).toContain("openai/");
  });

  it("does not show the previous provider's audio after changing provider", async () => {
    const view = fixture();
    let tree = view.render();
    view.fetch.mockResolvedValueOnce(new Response(Uint8Array.from([1, 2]), { headers: { "Content-Type": "audio/wav" } }));
    await runButton(tree).props.onClick();
    expect(view.fetch.mock.calls[0][0]).toBe("/api/v1/audio/speech?response_format=wav");
    tree = view.render();
    expect(find(tree, (node) => node.type === "a" && node.props.download === "speech.wav")).toBeTruthy();
    tree = view.render("openai");
    expect(find(tree, (node) => node.type === "a" && node.props.download)).toBeUndefined();
  });
});
