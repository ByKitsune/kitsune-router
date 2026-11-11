"use client";

import Link from "next/link";
import { Card } from "@/shared/components";
import Image from "next/image";

/** MITM tools share a dedicated setup page and its security controls. */
export default function MitmLinkCard({ tool }) {
  return (
    <Link href="/dashboard/mitm" className="integration-tool-link group block min-w-0 rounded-[14px]">
      <Card padding="none" className="integration-mitm-tile h-full cursor-pointer">
        <div className="flex min-w-0 items-center gap-3">
          <div className="integration-tool-icon shrink-0">
            <Image src={tool.image} alt="" width={28} height={28} className="size-7 rounded-lg object-contain" sizes="28px" onError={(event) => { event.target.style.display = "none"; }} loading="lazy" decoding="async" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-5 text-text-main">{tool.name}</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted">{tool.description}</p>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-text-muted">arrow_forward</span>
        </div>
      </Card>
    </Link>
  );
}
