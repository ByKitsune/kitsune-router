// Included in the documentation package's `npm test` glob.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAND } from "../../branding/identity.mjs";
import { DOCS_IDENTITY } from "../constants/identity.mjs";
import { getDocumentSummary, markdownToSearchText, normalizeSearchText, searchDocuments } from "../lib/search.mjs";
import { createDocsMetadata } from "../lib/metadata.mjs";
import { docsHref, getDocsOrigin, socialImageUrl, withBasePath } from "../lib/urls.mjs";

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Kitsune Router docs public identity", () => {
  it("keeps the isolated docs snapshot aligned with canonical public branding", () => {
    for (const [key, value] of Object.entries(DOCS_IDENTITY)) assert.equal(value, BRAND[key], key);
    assert.equal(read("../public/icons/logo.svg"), read("../../public/icons/logo.svg"));
  });

  it("uses the synchronized private docs package version rather than a hardcoded display release", () => {
    const packageInfo = JSON.parse(read("../package.json"));
    assert.equal(packageInfo.version, JSON.parse(read("../../package.json")).version);
    assert.equal(packageInfo.private, true);
    assert.match(read("../constants/docsConfig.js"), /version: packageInfo\.version/);
    assert.match(read("../constants/docsConfig.js"), /appUrl: "http:\/\/localhost:20128"/);
  });

  it("does not retain the decorative 9 or the previous shell palette", () => {
    const header = read("../components/DocsHeader.js");
    assert.doesNotMatch(header, /<span[^>]*>9<\/span>/);
    const shell = ["DocsHeader", "DocsLayout", "DocsSidebar", "DocsToc", "LanguageSwitcher"].map(name => read(`../components/${name}.js`)).join("\n");
    assert.doesNotMatch(shell + read("../app/globals.css"), /#E68A6E|#FCFBF9|font-family:\s*['"]Inter/i);
    assert.match(read("../app/globals.css"), /--docs-paper: #fffefa/);
    assert.match(read("../app/globals.css"), /--docs-ink: #30241d/);
    assert.match(read("../app/globals.css"), /--docs-ember: #a63f23/);
  });
});

describe("docs static paths and metadata", () => {
  it("prefixes raw assets and export redirects without adding a fake origin", () => {
    assert.equal(withBasePath("/icons/logo.svg", ""), "/icons/logo.svg");
    assert.equal(withBasePath("/icons/logo.svg", "/docs/"), "/docs/icons/logo.svg");
    assert.equal(withBasePath(docsHref("ja", "features/combos"), "/docs"), "/docs/ja/features/combos/");
    assert.equal(docsHref("zh-CN"), "/zh-CN/");
    assert.equal(socialImageUrl(null, "/docs"), "/docs/brand/social-card.png");
  });

  it("rejects accidental localhost metadata origins", () => {
    for (const value of ["", "not-a-url", "ftp://example.invalid", "http://localhost:3001", "http://docs.localhost", "http://127.0.0.1:3001", "http://[::1]:3001", "https://user:password@example.invalid", "https://example.invalid/docs"]) {
      assert.equal(getDocsOrigin(value), null, value);
    }
    assert.equal(getDocsOrigin("https://docs.example.invalid/"), "https://docs.example.invalid");
  });

  it("omits canonical and OG page URLs until a deployment origin is explicitly set", () => {
    const metadata = createDocsMetadata({ lang: "ja", pathname: "/ja/", origin: null, basePath: "/docs" });
    assert.equal(metadata.metadataBase, undefined);
    assert.equal(metadata.alternates, undefined);
    assert.equal(metadata.openGraph.url, undefined);
    assert.equal(metadata.openGraph.images, undefined);
    assert.equal(metadata.openGraph.locale, "ja_JP");
    assert.equal(metadata.icons.icon.url, "/docs/icons/logo.svg");
    assert.doesNotMatch(JSON.stringify(metadata), /localhost|https?:\/\//);
  });

  it("composes canonical and image URLs only from an operator-supplied public origin", () => {
    const metadata = createDocsMetadata({ title: "Installation", pathname: "/en/getting-started/installation/", origin: "https://docs.example.invalid", basePath: "/guide" });
    assert.equal(metadata.alternates.canonical, "https://docs.example.invalid/guide/en/getting-started/installation/");
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(socialImageUrl("https://docs.example.invalid", "/guide"), "https://docs.example.invalid/guide/brand/social-card.png");
  });

  it("exports the PNG social image statically rather than relying on a server", () => {
    const route = read("../app/brand/social-card.png/route.js");
    assert.match(route, /export const dynamic = "force-static"/);
    assert.match(route, /new ImageResponse/);
    assert.doesNotMatch(route, /<img\b|next\/image|(?:eslint|oxlint)-disable/);
    const logo = read("../public/icons/logo.svg");
    const logoPaths = [...logo.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
    for (const geometry of logoPaths) assert.ok(route.includes(`d="${geometry}"`), geometry);
    assert.match(read("../app/layout.js"), /property="og:image" content=\{socialImageUrl\(\)\}/);
  });

  it("uses supported non-brand Lucide icons for repository links", () => {
    for (const name of ["DocsContent", "DocsSidebar"]) {
      const source = read(`../components/${name}.js`);
      assert.doesNotMatch(source, /\bGithub\b/);
      assert.match(source, /<Code2\b/);
    }
  });
});

describe("local multilingual docs search", () => {
  const entries = [
    { slug: "getting-started/installation", title: "Installation", section: "Getting started", text: "Install the self-hosted gateway with Docker.", description: "Installation guide" },
    { slug: "features/combos", title: "Combos", section: "Features", text: "Installation is required before configuring fallback routes.", description: "Fallback guide" },
    { slug: "vi", title: "Định tuyến thông minh", section: "Tính năng", text: "Cấu hình nhà cung cấp của bạn.", description: "Tiếng Việt" },
    { slug: "ja", title: "クイックスタート", section: "はじめに", text: "モデルのルーティングを設定する。", description: "日本語" },
    { slug: "zh-CN", title: "配额跟踪", section: "功能", text: "配置模型和提供商。", description: "中文" },
  ];

  it("ranks page titles above body matches and requires every query term", () => {
    assert.equal(searchDocuments(entries, "installation")[0].slug, "getting-started/installation");
    assert.equal(searchDocuments(entries, "gateway docker")[0].slug, "getting-started/installation");
    assert.deepEqual(searchDocuments(entries, "gateway impossible"), []);
    assert.equal(searchDocuments(entries, "", 2).length, 2);
  });

  it("normalizes Vietnamese accents without losing CJK text", () => {
    assert.equal(normalizeSearchText("Định tuyến"), "dinh tuyen");
    assert.equal(searchDocuments(entries, "dinh tuyen")[0].slug, "vi");
    assert.equal(searchDocuments(entries, "ルーティング")[0].slug, "ja");
    assert.equal(searchDocuments(entries, "配额")[0].slug, "zh-CN");
  });

  it("extracts readable titles, descriptions, links, and code for local search", () => {
    const markdown = "# 🚀 Installation\n\nConnect **your tools** to the AI providers you choose with local routing.\n\n[Quick start](/en/getting-started/quick-start/)\n\n```sh\nnpx @bykitsune/router\n```";
    const summary = getDocumentSummary(markdown);
    assert.equal(summary.title, "Installation");
    assert.match(summary.description, /^Connect your tools/);
    assert.match(markdownToSearchText(markdown), /Quick start/);
    assert.match(markdownToSearchText(markdown), /npx @bykitsune\/router/);
    assert.doesNotMatch(markdownToSearchText(markdown), /```|\*\*/);
  });

  it("preserves snake-case configuration names in code searches", () => {
    const text = markdownToSearchText("Set `KITSUNE_ROUTER_PORT=20128` and `api_key` in the _local_ configuration.");
    assert.match(text, /KITSUNE_ROUTER_PORT/);
    assert.match(text, /api_key/);
    assert.doesNotMatch(text, /_local_/);
    assert.equal(searchDocuments([{ slug: "config", title: "Configuration", text }], "api_key")[0].slug, "config");
  });
});

describe("docs keyboard and language structure", () => {
  it("uses native modal focus management with a Safari light-dismiss fallback", () => {
    const dialog = read("../components/DocsDialog.js");
    assert.match(dialog, /<dialog/);
    assert.match(dialog, /\.showModal\(\)/);
    assert.match(dialog, /closedby="any"/);
    assert.match(dialog, /"closedBy" in dialog/);
    assert.match(dialog, /getBoundingClientRect/);
    assert.match(dialog, /aria-labelledby=\{labelledBy\}/);
  });

  it("keeps the reader's language and current-page location exposed to assistive technology", () => {
    assert.match(read("../components/DocsLayout.js"), /lang=\{lang\}/);
    assert.match(read("../components/DocsHeader.js"), /document\.documentElement\.lang = lang/);
    assert.match(read("../components/DocsLayout.js"), /href="#docs-content"/);
    assert.match(read("../components/DocsContent.js"), /id="docs-content" tabIndex=\{-1\}/);
    const sidebar = read("../components/DocsSidebar.js");
    assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
    assert.match(sidebar, /aria-expanded=\{expanded\}/);
    assert.doesNotMatch(sidebar, /sessionStorage/);
    assert.match(read("../components/LanguageSwitcher.js"), /href=\{docsHref\(language\.code, slug\)\}/);
  });

  it("has localized search, menu, and sponsor labels for every supported language", () => {
    const config = read("../constants/docsConfig.js");
    for (const key of ["searchDocs", "searchPlaceholder", "searchHint", "searchEmpty", "openMenu", "closeMenu", "skipToContent", "sponsorNote"]) {
      assert.equal((config.match(new RegExp(`\\b${key}:`, "g")) || []).length, 5, key);
    }
    assert.match(read("../components/DocsSearch.js"), /event\.nativeEvent\.isComposing/);
    assert.match(read("../components/DocsSearch.js"), /type="search"/);
  });
});
