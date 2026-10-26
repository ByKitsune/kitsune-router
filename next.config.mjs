import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dataDirectory from "./cli/hooks/dataDirectory.js";

// Must precede config capture; this helper performs no state-directory I/O.
dataDirectory.migrateLegacyEnvironment(process.env);

const projectRoot = dirname(fileURLToPath(import.meta.url));
// CLI bundling needs workspace root so tracing includes hoisted node_modules (slim ~50MB).
// Docker / default uses projectRoot so server.js lands at /app/server.js (not nested).
const tracingRoot = process.env.NEXT_TRACING_ROOT_MODE === "workspace"
  ? join(projectRoot, "..")
  : projectRoot;
// NINEROUTER_* is a migration-only alias; new configurations use KITSUNE_ROUTER_*.
const proxyClientMaxBodySize = process.env.KITSUNE_ROUTER_PROXY_CLIENT_MAX_BODY_SIZE || process.env.NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE || "128mb";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  // `open` must stay external. It derives its own directory from `import.meta.url`, and
  // webpack replaces that with the absolute path of the BUILD machine as a string literal.
  // A release built on macOS therefore ships `file:///Users/.../open/index.js`, which
  // `fileURLToPath` rejects on Windows ("File URL path must be absolute" — no drive
  // letter). That throw happens at module scope, so every consumer of `open` dies on
  // import — including xAI/Grok token refresh, which loads the OAuth service that imports
  // it. Keeping it external preserves the real `import.meta.url` at runtime.
  // Native resolution lets standalone tracing retain the full PKI dependency
  // closure for the raw MITM child, not just Next's bundled certificate code.
  serverExternalPackages: ["better-sqlite3", "sql.js", "node:sqlite", "bun:sqlite", "open", "@peculiar/x509", "reflect-metadata"],
  turbopack: {
    root: tracingRoot
  },
  outputFileTracingRoot: tracingRoot,
  outputFileTracingIncludes: {
    "/*": ["./src/mitm/**/*", "./cli/hooks/*.js", "./branding/identity.mjs", "./src/shared/constants/mitmToolHosts.js", "./open-sse/config/clientVersions.js", "./node_modules/next/dist/lib/metadata/**/*"]
  },
  outputFileTracingExcludes: {
    "*": [
      "./gitbook/**/*", "./.verification/**/*", "./verification/**/*",
      "./cli/.build-home/**/*", "./cli/app/**/*", "./data/**/*", "./.data/**/*",
      "./.kitsune-router/**/*", "./.zenrouter/**/*", "./.9router/**/*", // Never trace legacy private state.
      "./.env", "./.env.*", "./**/*.sqlite", "./**/*.sqlite-wal", "./**/*.sqlite-shm",
      "./**/secrets.json", "./**/secrets.env", "./**/machine-id", "./**/.npmrc",
    ]
  },
  images: {
    unoptimized: true
  },
  env: {},
  experimental: {
    // #1529/#1572: LLM clients can send long context or base64 image payloads through /v1 rewrites.
    proxyClientMaxBodySize,
    // Cache fetch responses across HMR refreshes for faster dev reloads.
    serverComponentsHmrCache: true,
    // Tree-shake heavy barrel imports to cut compile + bundle size
    optimizePackageImports: ["@xyflow/react", "@dnd-kit/core", "@dnd-kit/sortable", "material-symbols"],
  },
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Exclude non-source dirs from watcher to reduce inotify load
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 300,
      ignored: /[\\/](node_modules|\.git|logs|\.next|\.next-cli-build|gitbook|cli|open-sse\.old|tests|docs)[\\/]/,
    };
    return config;
  },
  async headers() {
    // Browsers apply every enforcing CSP, including policies injected by a proxy.
    // Keep proxy policies aligned with the application: connect-src 'none' at the
    // proxy still blocks requests even when this application policy allows them.
    // Baseline security headers apply to local and public deployments, including
    // installations exposed through a reverse proxy or tunnel.
    //   - X-Content-Type-Options stops MIME sniffing (a JSON error body must
    //     never be interpreted as HTML/script).
    //   - X-Frame-Options + frame-ancestors block clickjacking of the dashboard.
    //   - Referrer-Policy keeps a dashboard URL (which may carry a query) out of
    //     third-party Referer headers.
    //   - Permissions-Policy denies device APIs the dashboard never uses.
    // HSTS is only meaningful over HTTPS, including when a proxy terminates TLS.
    // Plain-HTTP loopback requests are unaffected (browsers ignore HSTS on http://).
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    const dashboardCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://static.cloudflareinsights.com https://cloudflareinsights.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      // GA4 beacons to google-analytics.com, Insights beacons to cloudflareinsights.com, HMR needs ws/wss
      "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://static.cloudflareinsights.com https://cloudflareinsights.com https://cdn.jsdelivr.net ws: wss:",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        // API/SSE are non-browser or same-origin fetch — minimal CSP, no inline needed
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }, ...securityHeaders],
      },
      {
        source: "/v1/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }, ...securityHeaders],
      },
      {
        source: "/v1beta/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }, ...securityHeaders],
      },
      {
        source: "/((?!api|v1|v1beta|_next/static|_next/image).*)",
        headers: [{ key: "Content-Security-Policy", value: dashboardCsp }, ...securityHeaders],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/responses",
        destination: "/api/v1/responses"
      },
      {
        source: "/v1beta/:path*",
        destination: "/api/v1beta/:path*"
      },
      {
        source: "/v1beta",
        destination: "/api/v1beta"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
