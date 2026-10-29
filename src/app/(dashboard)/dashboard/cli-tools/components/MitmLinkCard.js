"use client";

import Link from "next/link";
import { Card } from "@/shared/components";
import Image from "next/image";

/**
 * Clickable card for MITM tools — navigates to /dashboard/mitm on click.
 */
export default function MitmLinkCard({ tool }) {
  return (
    <Link href="/dashboard/mitm" className="group block min-w-0 rounded-[20px]">
      <Card padding="sm" className="h-full min-h-[104px] overflow-hidden !rounded-[20px] !p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 motion-reduce:transform-none cursor-pointer">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">
              <Image
                src={tool.image}
                alt={tool.name}
                width={32}
                height={32}
                className="size-8 object-contain rounded-lg"
                sizes="32px"
                onError={(e) => { e.target.style.display = "none"; }}
              loading="lazy"
              decoding="async"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-sm">{tool.name}</h3>
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full">MITM</span>
              </div>
              <p className="text-xs text-text-muted truncate">{tool.description}</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-text-muted text-[20px]">chevron_right</span>
        </div>
      </Card>
    </Link>
  );
}
