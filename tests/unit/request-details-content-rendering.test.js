import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;
const fixtureModule = { exports: {} };
vm.runInNewContext(code + "\nmodule.exports.ResponseContent = RequestDetailResponseContent;", {
  module: fixtureModule, exports: fixtureModule.exports,
  require(id) {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return require(id);
    return {};
  },
}, { filename });
const ResponseContent = fixtureModule.exports.ResponseContent;
const render = response => renderToStaticMarkup(React.createElement(ResponseContent, { response }));

describe("recorded client response content rendering", () => {
  it.each([
    [{ answer: "structured fixture", count: 0 }, /&quot;answer&quot;: &quot;structured fixture&quot;/],
    [[{ type: "text", text: "typed fixture" }], /&quot;text&quot;: &quot;typed fixture&quot;/],
  ])("renders recorded structured JSON without passing objects to React", (content, expected) => {
    const html = render({ content });
    expect(html).toMatch(expected);
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("[No content]");
  });

  it.each([["plain fixture", "plain fixture"], ["", ""], [0, "0"], [false, "false"]])("preserves scalar content %j", (content, expected) => {
    expect(render({ content })).toMatch(new RegExp(`>${expected}</pre>$`));
  });

  it.each([undefined, null])("retains the missing-content marker for %s", content => {
    expect(render({ content })).toContain("[No content]");
  });

  it("escapes recorded markup and prioritizes redaction over structured payloads", () => {
    const content = { text: "<img src=x onerror=alert(1)>" };
    expect(render({ content })).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(render({ content })).not.toContain("<img");
    expect(render({ content, redacted: true })).toContain("Content redacted");
    expect(render({ content, redacted: true })).not.toContain("onerror");
  });

  it("keeps the drawer renderable if in-memory content cannot be serialized", () => {
    const content = {};
    content.self = content;
    expect(render({ content })).toContain("[Unable to display content]");
  });
});
