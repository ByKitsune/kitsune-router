"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { t } from "@/constants/docsConfig";
import { DEFAULT_LANG } from "@/constants/languages";

export default function DocsToc({ headings = [], lang = DEFAULT_LANG }) {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (!headings.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -65% 0px" }
    );

    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (!headings || headings.length === 0) return null;

  return (
    <aside className="docs-toc">
      <nav aria-label={t(lang, "onThisPage")}>
        <h2>
          <List size={16} aria-hidden="true" />
          {t(lang, "onThisPage")}
        </h2>
        <ul>
          {headings.map((heading, idx) => (
            <li key={`${heading.id}-${idx}`}>
              <a
                href={`#${heading.id}`}
                className={heading.level === 3 ? "docs-toc-nested" : undefined}
                aria-current={activeId === heading.id ? "location" : undefined}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
