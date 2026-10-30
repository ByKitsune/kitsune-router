import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as config from "../../src/i18n/config.js";

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL("../../src/i18n/runtime.js", import.meta.url));
const babel = require("next/dist/compiled/babel/core");
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

function fixture({ locale = "id", dictionaries = {} } = {}) {
  class Element {
    nodeType = 1;
    childNodes = [];
    parentElement = null;
    constructor(tag, attributes = {}) { this.tagName = tag.toUpperCase(); this.attributes = { ...attributes }; }
    appendChild(node) { this.childNodes.push(node); node.parentElement = this; return node; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelectorAll() { return this.childNodes.flatMap((child) => child.nodeType === 1 ? [child, ...child.querySelectorAll()] : []); }
    closest() {
      let element = this;
      while (element) {
        if (["SCRIPT", "STYLE", "CODE", "PRE", "KBD", "SAMP", "TEXTAREA"].includes(element.tagName)
          || "data-i18n-skip" in element.attributes || element.attributes.contenteditable === "true"
          || /(?:^|\s)(?:font-mono|material-symbols-outlined)(?:\s|$)/.test(element.attributes.class || "")) return element;
        element = element.parentElement;
      }
      return null;
    }
  }
  class Text {
    nodeType = 3;
    constructor(value) { this.nodeValue = value; }
  }
  const frames = new Map();
  const observers = [];
  const requests = [];
  let frameId = 0;
  const document = {
    body: new Element("body"), documentElement: new Element("html"), cookie: `locale=${locale}`,
    createTreeWalker(element) {
      const text = [];
      function collect(node) { for (const child of node.childNodes || []) { if (child.nodeType === 3) text.push(child); else collect(child); } }
      collect(element);
      let index = 0;
      return { nextNode: () => text[index++] || null };
    },
  };
  const fetch = vi.fn((url) => new Promise((resolve, reject) => {
    const request = { url, respond: (value, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => value }), reject };
    requests.push(request);
    const dictionary = dictionaries[url.match(/([^/]+)\.json$/)[1]];
    if (dictionary) request.respond(dictionary);
  }));
  class Observer {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback) { this.callback = callback; observers.push(this); }
  }
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports,
    require: (id) => { if (id === "./config") return config; throw new Error(id); },
    window: {}, document, fetch, MutationObserver: Observer,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4 },
    requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    console,
  }, { filename });
  return {
    runtime: fixtureModule.exports, document, fetch, requests, observers,
    element: (tag, attributes) => new Element(tag, attributes), text: (value) => new Text(value),
    mutate(records) { observers[0].callback(records); },
    flush() { for (let turn = 0; turn < 5 && frames.size; turn++) { const work = [...frames.values()]; frames.clear(); work.forEach((callback) => callback()); } expect(frames.size).toBe(0); },
  };
}

const id = { "Not specified": "Belum ditentukan", "Estimated cost": "Perkiraan biaya", "Search models": "Cari model", "{count} requests": "{count} permintaan", "Source {index}": "Sumber {index}", "{cost} local estimate": "{cost} perkiraan lokal", "Choose language, current: {language}": "Pilih bahasa, saat ini: {language}" };

describe("runtime UI localization", () => {
  it("translates the official provider card and its website label without changing brand identities", async () => {
    const dictionary = JSON.parse(readFileSync(new URL("../../public/i18n/literals/id.json", import.meta.url), "utf8"));
    const f = fixture({ dictionaries: { id: dictionary } });
    const badge = f.document.body.appendChild(f.element("span")).appendChild(f.text("Official provider"));
    const cardBadge = f.document.body.appendChild(f.element("span")).appendChild(f.text("Official"));
    const description = f.document.body.appendChild(f.element("p"));
    const prefix = description.appendChild(f.text("The official provider from the team behind "));
    const product = description.appendChild(f.text("Kitsune Router"));
    const suffix = description.appendChild(f.text(". Explore ByKitsune's AI services and ecosystem."));
    const website = f.document.body.appendChild(f.element("a", {
      "aria-label": "Visit ByKitsune website (opens in a new tab)",
      href: "https://bykitsune.com/",
    }));
    const caption = website.appendChild(f.text("Visit website"));

    const stop = await f.runtime.initRuntimeI18n();
    expect(badge.nodeValue).toBe("Penyedia resmi");
    expect(cardBadge.nodeValue).toBe("Resmi");
    expect(prefix.nodeValue + product.nodeValue + suffix.nodeValue)
      .toBe("Penyedia resmi dari tim pengembang Kitsune Router. Jelajahi layanan AI dan ekosistem ByKitsune.");
    expect(caption.nodeValue).toBe("Kunjungi situs web");
    expect(website.getAttribute("aria-label")).toBe("Kunjungi situs web ByKitsune (dibuka di tab baru)");
    expect(website.getAttribute("href")).toBe("https://bykitsune.com/");

    f.document.cookie = "locale=en";
    await f.runtime.reloadTranslations();
    expect(badge.nodeValue).toBe("Official provider");
    expect(website.getAttribute("aria-label")).toBe("Visit ByKitsune website (opens in a new tab)");
    stop();
  });

  it("formats named zero values, known numeric templates and whitespace without inventing missing translations", async () => {
    const f = fixture({ dictionaries: { id } });
    await f.runtime.reloadTranslations();
    expect(f.runtime.translate(" {count} requests ", { count: 0 })).toBe(" 0 permintaan ");
    expect(f.runtime.translate("12 requests")).toBe("12 permintaan");
    expect(f.runtime.translate("Source 2")).toBe("Sumber 2");
    expect(f.runtime.translate("Choose language, current: Indonesia")).toBe("Pilih bahasa, saat ini: Indonesia");
    expect(f.runtime.translate("{cost} local estimate", { cost: "$0.00" })).toBe("$0.00 perkiraan lokal");
    expect(f.runtime.translate("Private model name 123")).toBe("Private model name 123");
    f.document.cookie = "locale=en";
    await f.runtime.reloadTranslations();
    expect(f.runtime.translate("{count} requests", { count: 0 })).toBe("0 requests");
  });

  it("localizes React text updates and accessible attributes, then restores their newest English source", async () => {
    const f = fixture({ dictionaries: { id } });
    const label = f.document.body.appendChild(f.element("button", { "aria-label": "Source 1", title: "Estimated cost" }));
    const count = label.appendChild(f.text("2 requests"));
    const search = f.document.body.appendChild(f.element("input", { placeholder: "Search models", value: "Source 1" }));
    const stop = await f.runtime.initRuntimeI18n();
    expect(count.nodeValue).toBe("2 permintaan");
    expect(label.getAttribute("aria-label")).toBe("Sumber 1");
    expect(search.getAttribute("placeholder")).toBe("Cari model");
    expect(search.getAttribute("value")).toBe("Source 1");
    count.nodeValue = "7 requests";
    label.setAttribute("aria-label", "Source 2");
    f.mutate([{ type: "characterData", target: count }, { type: "attributes", target: label }]);
    f.flush();
    expect(count.nodeValue).toBe("7 permintaan");
    expect(label.getAttribute("aria-label")).toBe("Sumber 2");
    f.document.cookie = "locale=en";
    await f.runtime.reloadTranslations();
    expect(count.nodeValue).toBe("7 requests");
    expect(label.getAttribute("aria-label")).toBe("Source 2");
    expect(search.getAttribute("placeholder")).toBe("Search models");
    stop();
  });

  it("observes newly inserted subtrees while preserving nested code, icons, editable text and marked identifiers", async () => {
    const f = fixture({ dictionaries: { id } });
    await f.runtime.initRuntimeI18n();
    const section = f.document.body.appendChild(f.element("section"));
    const label = section.appendChild(f.text("Not specified"));
    const protectedNodes = [
      section.appendChild(f.element("code")).appendChild(f.element("span")).appendChild(f.text("Not specified")),
      section.appendChild(f.element("span", { class: "font-mono" })).appendChild(f.text("Not specified")),
      section.appendChild(f.element("span", { class: "material-symbols-outlined" })).appendChild(f.text("Not specified")),
      section.appendChild(f.element("div", { "data-i18n-skip": "true" })).appendChild(f.text("Not specified")),
      section.appendChild(f.element("div", { contenteditable: "true" })).appendChild(f.text("Not specified")),
    ];
    f.mutate([{ type: "childList", addedNodes: [section] }]);
    f.flush();
    expect(label.nodeValue).toBe("Belum ditentukan");
    expect(protectedNodes.map((node) => node.nodeValue)).toEqual(Array(5).fill("Not specified"));
  });

  it("keeps live status changes instead of pinning the original mounted message forever", async () => {
    const f = fixture({ dictionaries: { id } });
    const status = f.document.body.appendChild(f.element("p")).appendChild(f.text("Estimated cost"));
    await f.runtime.initRuntimeI18n();
    status.nodeValue = "Not specified";
    f.mutate([{ type: "characterData", target: status }]);
    f.flush();
    expect(status.nodeValue).toBe("Belum ditentukan");
    f.document.cookie = "locale=en";
    await f.runtime.reloadTranslations();
    expect(status.nodeValue).toBe("Not specified");
  });

  it("does not let a slow previous dictionary replace a newer selected language", async () => {
    const f = fixture();
    const changed = vi.fn();
    f.runtime.onLocaleChange(changed);
    const older = f.runtime.reloadTranslations();
    f.document.cookie = "locale=ja";
    const newer = f.runtime.reloadTranslations();
    f.requests[1].respond({ "Not specified": "未指定" });
    expect(await newer).toBe(true);
    f.requests[0].respond(id);
    expect(await older).toBe(false);
    expect(f.runtime.getCurrentLocale()).toBe("ja");
    expect(f.runtime.translate("Not specified")).toBe("未指定");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("rejects HTTP/shape errors, retains the prior language and permits a later retry", async () => {
    const f = fixture({ locale: "ja", dictionaries: { ja: { "Not specified": "未指定" } } });
    await f.runtime.reloadTranslations();
    f.document.cookie = "locale=id";
    const failed = f.runtime.reloadTranslations();
    f.requests[1].respond({ error: "offline" }, 503);
    await expect(failed).rejects.toThrow("503");
    expect(f.runtime.translate("Not specified")).toBe("未指定");
    const invalid = f.runtime.reloadTranslations();
    f.requests[2].respond(["wrong shape"]);
    await expect(invalid).rejects.toThrow("Invalid translation dictionary");
    const retried = f.runtime.reloadTranslations();
    f.requests[3].respond(id);
    await retried;
    expect(f.runtime.translate("Not specified")).toBe("Belum ditentukan");
  });

  it("shares cached loads and one observer, disconnecting only the final mounted consumer", async () => {
    const f = fixture({ dictionaries: { id } });
    const [first, second] = await Promise.all([f.runtime.initRuntimeI18n(), f.runtime.initRuntimeI18n()]);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.observers).toHaveLength(1);
    first(); first();
    expect(f.observers[0].disconnect).not.toHaveBeenCalled();
    second();
    expect(f.observers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("handles malformed locale cookies and renders translations as text rather than markup", async () => {
    const f = fixture({ dictionaries: { id: { "Not specified": "<img src=x onerror=alert(1)>" } } });
    const element = f.document.body.appendChild(f.element("p"));
    const text = element.appendChild(f.text("Not specified"));
    await f.runtime.reloadTranslations();
    expect(text.nodeValue).toContain("<img");
    expect(element.childNodes).toEqual([text]);
    f.document.cookie = "locale=%invalid";
    await f.runtime.reloadTranslations();
    expect(f.runtime.getCurrentLocale()).toBe("en");
    expect(text.nodeValue).toBe("Not specified");
  });
});

it("registers every extracted source literal and supplies Indonesian translations with intact template parameters", () => {
  const audit = spawnSync(process.execPath, ["scripts/audit-ui-i18n.mjs", "--check"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8", timeout: 15000,
  });
  expect(audit.error).toBeUndefined();
  expect(audit.status, audit.stderr).toBe(0);
});
