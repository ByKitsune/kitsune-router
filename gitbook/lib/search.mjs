export function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function markdownToSearchText(content = "") {
  return content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/(^|\s)_{1,2}([^_\n]+)_{1,2}(?=$|\s|[.,;:!?])/g, "$1$2")
    .replace(/[*`|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDocumentSummary(content = "") {
  const title = content.match(/^#\s+(.+)$/m)?.[1]
    ?.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "")
    .replace(/[*_`]/g, "")
    .trim();
  const paragraphs = content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .split(/\n\s*\n/);
  const description = paragraphs
    .filter(part => part.trim() && !/^\s*(?:#|[-*+]\s|\d+\.\s|\||---|>)/.test(part))
    .map(markdownToSearchText)
    .find(text => text.length > 35);
  return { title, description: description?.slice(0, 190) };
}

export function searchDocuments(entries = [], query = "", limit = 10) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return entries.slice(0, limit);
  const terms = normalizedQuery.split(" ");

  return entries
    .map(entry => {
      const title = normalizeSearchText(entry.title);
      const section = normalizeSearchText(entry.section);
      const text = normalizeSearchText(entry.text);
      const haystack = `${title} ${section} ${text}`;
      if (!terms.every(term => haystack.includes(term))) return null;
      const score = (title === normalizedQuery ? 100 : 0)
        + (title.includes(normalizedQuery) ? 40 : 0)
        + terms.reduce((sum, term) => sum + (title.includes(term) ? 12 : 0) + (section.includes(term) ? 4 : 0), 0);
      return { entry, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
