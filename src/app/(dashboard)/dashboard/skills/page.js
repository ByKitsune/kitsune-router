"use client";

import { Card, Badge } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button
      onClick={() => copy(value)}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-medium text-[var(--color-on-primary)] transition-colors hover:bg-primary-hover"
      title={value}
    >
      <span className="material-symbols-outlined text-[12px]">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? "Copied!" : label}
    </button>
  );
}

function SkillRow({ skill }) {
  const url = getSkillRawUrl(skill.id);
  return (
    <div
      className={`group flex min-w-0 flex-col items-start gap-4 rounded-[22px] border p-5 shadow-[var(--shadow-soft)] transition-colors sm:flex-row ${
        skill.isEntry
          ? "border-brand-500/40 bg-brand-500/5"
          : "border-border-subtle bg-surface hover:bg-surface-2"
      }`}
    >
      <div
        className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
          skill.isEntry ? "bg-primary text-white" : "bg-primary/10 text-primary"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">{skill.icon}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm text-text-main">{skill.name}</h3>
          {skill.isEntry && (
            <Badge variant="primary" size="sm">START HERE</Badge>
          )}
          {skill.endpoint && (
            <Badge variant="default" size="sm">
              <code className="text-[10px]">{skill.endpoint}</code>
            </Badge>
          )}
        </div>
        <p className="text-xs text-text-muted mt-0.5">{skill.description}</p>
        <a
          href={getSkillBlobUrl(skill.id)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex max-w-full items-start gap-1 break-all text-[11px] leading-5 text-text-muted hover:text-primary"
        >
          {url}
          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        </a>
      </div>

      <CopyButton value={url} />
    </div>
  );
}

export default function SkillsPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-6">
      <div className="mb-7 flex min-w-0 flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Agent workspace</p>
        <h2 className="text-2xl font-semibold tracking-[-0.045em] text-text-main sm:text-3xl">Give your agents a head start</h2>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">Nine focused guides for secure setup, model discovery, bounded requests, and reliable results from your configured gateway.</p>
      </div>
      <Card padding="md">
        <div className="text-xs text-text-muted mb-2">Paste this to your AI:</div>
        <div className="break-all rounded-2xl border border-border-subtle bg-surface-2 px-4 py-4 font-mono text-xs leading-6 text-text-main">
          Read this skill and use it: {getSkillRawUrl("kitsune-router")}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Skill workflow">
        {[
          { icon: "key", title: "Connect securely", text: "Use environment bindings for gateway credentials." },
          { icon: "travel_explore", title: "Discover first", text: "Choose capabilities advertised by your installation." },
          { icon: "task_alt", title: "Verify the result", text: "Keep retries, output and upstream costs within scope." },
        ].map(({ icon, title, text }) => (
          <div key={title} className="flex min-w-0 items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-4">
            <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-[19px] text-primary">{icon}</span>
            <div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{text}</p></div>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {SKILLS.map((skill) => (
          <SkillRow key={skill.id} skill={skill} />
        ))}
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-text-main">More on GitHub</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Browse source, README, and examples.
            </p>
          </div>
          <a
            href={`${SKILLS_REPO_URL}/tree/master/skills`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            View on GitHub
          </a>
        </div>
      </Card>
    </div>
  );
}
