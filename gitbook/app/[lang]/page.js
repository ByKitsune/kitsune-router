import DocsLayout from "@/components/DocsLayout";
import DocsContent from "@/components/DocsContent";
import { extractHeadings } from "@/utils/markdown";
import { loadContent } from "@/lib/content";
import { LANG_CODES, isValidLang } from "@/constants/languages";
import { notFound } from "next/navigation";
import { createDocsMetadata } from "@/lib/metadata.mjs";

export const dynamicParams = false;

export async function generateStaticParams() {
  return LANG_CODES.map(lang => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  if (!isValidLang(lang)) notFound();
  return createDocsMetadata({ lang, pathname: `/${lang}/` });
}

export default async function LangHomePage({ params }) {
  const { lang } = await params;
  if (!isValidLang(lang)) notFound();

  const content = loadContent(lang, "index");
  if (!content) notFound();
  const headings = extractHeadings(content);

  return (
    <DocsLayout headings={headings} lang={lang}>
      <DocsContent content={content} lang={lang} />
    </DocsLayout>
  );
}
