/** One destination catalog for the sidebar, mobile dock and page finder. */
const groups = [
  {
    id: "gateway", label: "Gateway", items: [
      { id: "endpoint", href: "/dashboard/endpoint", label: "Endpoint & key", description: "Manage gateway access, API keys and tunnels", icon: "key", keywords: ["api", "access", "tunnel", "tailscale"] },
      { id: "providers", href: "/dashboard/providers", label: "Providers", description: "Connect accounts and manage available models", icon: "providers", keywords: ["account", "models", "oauth", "connection"] },
      { id: "combos", href: "/dashboard/combos", label: "Combos & adapters", description: "Organize model routes and fallback strategies", icon: "layers", keywords: ["fallback", "routing", "fusion", "media combo"] },
    ],
  },
  {
    id: "workspace", label: "Workspace", items: [
      { id: "chat", href: "/dashboard/basic-chat", label: "Chat", description: "Try a conversation through your configured routes", icon: "chat", keywords: ["playground", "conversation", "test"] },
      { id: "cli-tools", href: "/dashboard/cli-tools", label: "CLI tools", description: "Configure coding tools and integrations", icon: "code", keywords: ["claude", "codex", "terminal", "integration", "opencode"] },
      {
        id: "media", label: "Media providers", description: "Browse image, video, audio and web providers", icon: "media", children: [
          { id: "media-embedding", href: "/dashboard/media-providers/embedding", label: "Embedding", description: "Configure embedding providers", icon: "embedding", keywords: ["vector"] },
          { id: "media-image", href: "/dashboard/media-providers/image", label: "Text to Image", description: "Configure image generation providers", icon: "image", keywords: ["picture", "generation"] },
          { id: "media-video", href: "/dashboard/media-providers/video", label: "Video", description: "Configure video generation providers", icon: "video", keywords: ["movie", "generation"] },
          { id: "media-tts", href: "/dashboard/media-providers/tts", label: "Text To Speech", description: "Configure speech generation providers", icon: "audio", keywords: ["audio", "voice", "tts"] },
          { id: "media-stt", href: "/dashboard/media-providers/stt", label: "Speech To Text", description: "Configure speech transcription providers", icon: "microphone", keywords: ["audio", "voice", "stt", "transcribe"] },
          { id: "media-web", href: "/dashboard/media-providers/web", label: "Web fetch & search", description: "Configure web search and page retrieval", icon: "globe", keywords: ["internet", "browse", "crawl"] },
        ],
      },
      { id: "skills", href: "/dashboard/skills", label: "Skills", description: "Find setup guidance for your agents", icon: "skills", keywords: ["agent", "setup", "install"] },
    ],
  },
  {
    id: "observe", label: "Observe & optimize", items: [
      { id: "usage", href: "/dashboard/usage", label: "Usage", description: "Review requests, tokens and recorded costs", icon: "chart", keywords: ["analytics", "history", "logs", "billing", "spend"] },
      { id: "quota", href: "/dashboard/quota", label: "Quota tracker", description: "Review account quotas and limits", icon: "quota", keywords: ["limit", "balance", "capacity"] },
      { id: "token-saver", href: "/dashboard/token-saver", label: "Token saver", description: "Configure token saving options", icon: "savings", keywords: ["compression", "headroom", "rtk"] },
      { id: "pxpipe", href: "/dashboard/pxpipe", label: "PXPIPE", description: "Review tool output savings and history", icon: "activity", keywords: ["optimization", "compression", "savings"] },
    ],
  },
  {
    id: "system", label: "System", items: [
      { id: "proxy-pools", href: "/dashboard/proxy-pools", label: "Proxy pools", description: "Manage outbound proxy pool configurations", icon: "network", keywords: ["network", "egress", "connection"] },
      { id: "mitm", href: "/dashboard/mitm", label: "MITM Proxy", description: "Configure local tool traffic interception", icon: "shield", keywords: ["certificate", "intercept", "proxy"] },
      { id: "console-log", href: "/dashboard/console-log", label: "Console log", description: "Inspect live server console output", icon: "terminal", keywords: ["debug", "logs", "errors"] },
      { id: "translator", href: "/dashboard/translator", label: "Translator", description: "Inspect format translation between providers", icon: "translate", keywords: ["debug", "request", "response", "format"] },
    ],
  },
  {
    id: "preferences", label: "Preferences", items: [
      { id: "settings", href: "/dashboard/profile", label: "Settings", description: "Manage dashboard preferences and account security", icon: "settings", keywords: ["profile", "password", "account", "security", "language", "theme"] },
      { id: "pricing", href: "/dashboard/settings/pricing", label: "Pricing", description: "Review model pricing and cost coverage", icon: "pricing", keywords: ["price", "rate", "cost", "billing"] },
    ],
  },
];

export function getNavigationGroups({ enableTranslator = false } = {}) {
  return groups.map(group => ({
    ...group,
    items: group.items
      .filter(item => item.id !== "translator" || enableTranslator)
      .map(item => ({ ...item, ...(item.children ? { children: item.children.map(child => ({ ...child })) } : {}) })),
  }));
}

/** Leaf entries carry their context so search need not duplicate the hierarchy. */
export function flattenNavigationItems(navigationGroups) {
  const leaves = [];
  for (const group of navigationGroups) {
    for (const item of group.items) {
      const context = { groupId: group.id, groupLabel: group.label };
      if (item.href) leaves.push({ ...item, ...context });
      for (const child of item.children || []) {
        if (child.href) leaves.push({ ...child, ...context, parent: { id: item.id, label: item.label, icon: item.icon } });
      }
    }
  }
  return leaves;
}

function normalizePath(pathname) {
  return typeof pathname === "string" ? pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") : "";
}

export function isNavigationRoute(pathname, href) {
  const path = normalizePath(pathname);
  const target = normalizePath(href);
  if (!path || !target) return false;
  if (target === "/dashboard/endpoint" && path === "/dashboard") return true;
  if (target === "/dashboard/combos" && path.startsWith("/dashboard/media-providers/combo/")) return true;
  return path === target || path.startsWith(`${target}/`);
}

/** Feature visibility does not prevent a directly visited page getting context. */
export function findNavigationRoute(pathname) {
  return flattenNavigationItems(getNavigationGroups({ enableTranslator: true }))
    .filter(item => isNavigationRoute(pathname, item.href))
    .sort((first, second) => second.href.length - first.href.length)[0] || null;
}
