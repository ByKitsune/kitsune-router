import fs from "fs";
import path from "path";
import { DEFAULT_LANG, isValidLang } from "@/constants/languages";
import { getNavigation } from "@/constants/docsConfig";
import { getDocumentSummary, markdownToSearchText } from "./search.mjs";

const CONTENT_ROOT = path.join(process.cwd(), "content");

function readContentFile(lang, slugPath) {
  const filePath = path.join(CONTENT_ROOT, lang, `${slugPath}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

// Load content with fallback to default language if missing
export function loadContent(lang, slug = "index") {
  const safeLang = isValidLang(lang) ? lang : DEFAULT_LANG;
  const slugPath = Array.isArray(slug) ? slug.join("/") : slug;
  return readContentFile(safeLang, slugPath) || readContentFile(DEFAULT_LANG, slugPath);
}

// Walk content/<lang>/ to collect all slugs (excluding index.md)
export function getAllSlugs(lang = DEFAULT_LANG) {
  const baseDir = path.join(CONTENT_ROOT, lang);
  if (!fs.existsSync(baseDir)) return [];

  const walk = (dir, basePath = "") => {
    const files = fs.readdirSync(dir);
    let results = [];
    files.forEach(file => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results = results.concat(walk(full, path.join(basePath, file)));
      } else if (file.endsWith(".md") && file !== "index.md") {
        const slug = path.join(basePath, file.replace(/\.md$/, ""));
        results.push(slug.split(path.sep));
      }
    });
    return results;
  };

  return walk(baseDir);
}

// Built at export time and passed to the docs shell. Search never sends the
// reader's query or documentation content to a hosted search provider.
export function getSearchIndex(lang = DEFAULT_LANG) {
  const navigation = getNavigation(lang);
  const navigationBySlug = new Map(navigation.flatMap(section => section.items.map(item => [item.slug, { ...item, section: section.title }])));
  const slugs = [...navigationBySlug.keys(), ...getAllSlugs(DEFAULT_LANG).map(parts => parts.join("/")), ...getAllSlugs(lang).map(parts => parts.join("/"))];

  return [...new Set(slugs)].flatMap(slug => {
    const content = loadContent(lang, slug || "index");
    if (!content) return [];
    const navigationItem = navigationBySlug.get(slug);
    const summary = getDocumentSummary(content);
    return [{
      slug,
      title: summary.title || navigationItem?.title || slug,
      section: navigationItem?.section || "",
      description: summary.description || "",
      text: markdownToSearchText(content),
    }];
  });
}
