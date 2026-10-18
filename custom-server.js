const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { isIP } = require("node:net");
const { pathToFileURL } = require("url");

const origCreate = http.createServer.bind(http);

// Load a .env sitting next to this file (or in the standalone project root)
// BEFORE anything reads process.env. Next's standalone server only reads .env
// from its own project dir, and the published CLI bundle ships none — so
// operators who put a .env beside the server previously had it silently
// ignored, and JWT_SECRET fell through to the "environment variable is
// required" startup failure. Existing env vars always win (never override).
(function loadDotEnv() {
  try {
    for (const candidate of [path.join(__dirname, ".env"), path.join(process.cwd(), ".env")]) {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!key || key in process.env) continue;
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
      break;
    }
  } catch {
    // A malformed or unreadable .env must never prevent the server from booting.
  }
})();

// Fix #3744: suppress SOCKS5 and SQLite ExperimentalWarning (undici socks5-proxy-agent and node:sqlite emit on first use)
if (typeof process !== "undefined") {
  const origEmit = process.emit;
  if (typeof origEmit === "function") {
    process.emit = function (name, data, ...rest) {
      if (
        name === "warning" &&
        data?.name === "ExperimentalWarning" &&
        /(?:SOCKS5|SQLite)/i.test(data?.message || String(data || ""))
      ) {
        return false;
      }
      return origEmit.call(process, name, data, ...rest);
    };
  }
  if (typeof process.emitWarning === "function") {
    const origEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = (warning, type, ...args) => {
      if (
        (type === "ExperimentalWarning" || (typeof warning === "object" && warning?.name === "ExperimentalWarning")) &&
        /(?:SOCKS5|SQLite)/i.test(typeof warning === "string" ? warning : warning?.message || "")
      ) {
        return;
      }
      return origEmitWarning(warning, type, ...args);
    };
  }
}

// Per-process secret proving x-zen-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.ZENROUTER_PEER_TOKEN = PEER_TOKEN;
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;

let backgroundRefreshStarted = false;

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    // Static Asset URL Normalizer: fix encoded dynamic segments in _next/static
    // e.g. /_next/static/chunks/app/(dashboard)/dashboard/providers/%5Bid%5D/page-*.js
    // Browser encodes [ ] ( ) but disk files are decoded. Without this, ChunkLoadError 2134.
    // Whitelist-only decode to avoid %2F/%2E path-traversal over-decode.
    if (req.url && req.url.includes("%") && req.url.includes("/_next/static/")) {
      try {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname.startsWith("/_next/static/") && url.pathname.includes("%")) {
          // Only decode brackets/parens/curly that Next uses for route groups/dynamic segments
          const decodedPath = url.pathname.replace(/%(2F|2E|28|29|5B|5D|7B|7D)/gi, (m) => {
            try {
              return decodeURIComponent(m);
            } catch {
              return m;
            }
          });
          // Guard against traversal after decode
          if (decodedPath !== url.pathname && !decodedPath.includes("..") && !decodedPath.includes("//")) {
            req.url = decodedPath + url.search;
          } else if (decodedPath !== url.pathname) {
            // Fallback to safe 4-code replace if traversal detected
            const safe = url.pathname
              .replace(/%28/gi, "(")
              .replace(/%29/gi, ")")
              .replace(/%5B/gi, "[")
              .replace(/%5D/gi, "]");
            if (safe !== url.pathname) req.url = safe + url.search;
          }
        }
      } catch {
        // Fallback for malformed URI — handle known encodings only, preserve query
        const qIdx = req.url.indexOf("?");
        const pathOnly = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
        const search = qIdx === -1 ? "" : req.url.slice(qIdx);
        if (pathOnly.startsWith("/_next/static/")) {
          const decoded = pathOnly
            .replace(/%28/gi, "(")
            .replace(/%29/gi, ")")
            .replace(/%5B/gi, "[")
            .replace(/%5D/gi, "]");
          if (decoded !== pathOnly) req.url = decoded + search;
        }
      }
    }

    // Low-latency streaming tuning: disable Nagle's algorithm (TCP_NODELAY) and enable TCP Keep-Alive
    if (req.socket) {
      if (typeof req.socket.setNoDelay === "function") req.socket.setNoDelay(true);
      if (typeof req.socket.setKeepAlive === "function") req.socket.setKeepAlive(true, 30000);
      // Log unexpected client socket errors without leaking listeners across requests
      const onSocketError = (err) => {
        if (err && err.code !== "ECONNRESET" && err.code !== "EPIPE") {
          console.error("[Socket] Client socket error:", err.message);
        }
      };
      req.socket.once("error", onSocketError);

      // Bun runtime compatibility (#3559): Bun's node:http ServerResponse never emits
      // 'close' when a client disconnects mid-stream, so Next's signalFromNodeResponse
      // never aborts request.signal and upstream keeps billing indefinitely.
      // We safely bridge the raw TCP socket's 'close' event into res.emit('close')
      // strictly when res has NOT finished writing (!res.writableFinished && !res.writableEnded).
      // This triggers Next's createAbortController -> request.signal.abort() ->
      // streamController.handleDisconnect("client_aborted") -> upstream fetch abort.
      const onSocketClose = () => {
        if (!res.writableFinished && !res.writableEnded) {
          if (typeof res.emit === "function") {
            try { res.emit("close"); } catch {}
          }
          if (typeof res.destroy === "function") {
            try { res.destroy(); } catch {}
          }
        }
      };
      req.socket.once("close", onSocketClose);
      if (typeof req.once === "function") {
        req.once("aborted", onSocketClose);
      }

      if (typeof res.once === "function") {
        const cleanupListeners = () => {
          if (req.socket && typeof req.socket.removeListener === "function") {
            req.socket.removeListener("error", onSocketError);
            req.socket.removeListener("close", onSocketClose);
          }
          if (typeof req.removeListener === "function") {
            req.removeListener("aborted", onSocketClose);
          }
        };
        res.once("finish", cleanupListeners);
        res.once("close", cleanupListeners);
      }
    }

    // NOTE: Client abort is handled natively via request.signal (see src/sse/handlers/chat.js
    // and open-sse/handlers/chatCore.js clientSignal.addEventListener('abort')).
    // Do NOT attach destructive req.once('close', () => res.destroy()) here because IncomingMessage
    // emits 'close' as soon as the request body stream finishes reading, which prematurely terminates
    // pending POST bodies (e.g. login and chat completions) before request.json() can parse them.

    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Only a valid rightmost XFF address appended by the loopback proxy is
    // trusted. A lone X-Real-IP must not create attacker-controlled rate-limit
    // buckets. Keep viaProxy even when the address is unusable: the proxy's
    // loopback socket does not grant the remote caller local privileges.
    const xffHops = xff ? String(xff).split(",") : [];
    const lastHop = xffHops.at(-1)?.trim() || "";
    const proxyIp = isIP(lastHop) ? lastHop : "";
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-zen-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-real-ip"];
    delete req.headers["x-zen-via-proxy"];
    delete req.headers["x-zen-peer-token"];
    req.headers["x-zen-real-ip"] = ip;
    req.headers["x-zen-peer-token"] = PEER_TOKEN;
    if (viaProxy) {
      req.headers["x-zen-via-proxy"] = "1";
    }

    return handler(req, res);
  };
  const server = origCreate(...rest, wrapped);
  // Increase HTTP keep-alive timeout to prevent stale connection resets during agent idle periods.
  // Default Node keepAliveTimeout is 5s, which causes "error sending request" after idle.
  // See decolua/9router#3709.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.once("listening", () => {
    startBackgroundTokenRefreshFromCustomServer();
  });
  const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      socket.destroy();
      return true;
    }
    const chunks = [head];
    let received = head.length;
    const serve = () => {
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const standalone = path.join(__dirname, "server.js");
  if (fs.existsSync(standalone)) {
    require(standalone);
  } else {
    // Repo checkout has no standalone build next to us. `next start` builds its HTTP
    // server in-process, so the wrapper above still sanitizes every request.
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
