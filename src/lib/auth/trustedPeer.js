let warnedDevMode = false;

// x-kitsune-router-real-ip is only trustworthy when custom-server.js stamped it from the TCP socket.
// It proves that by echoing the per-process secret it generated at boot, which a client
// cannot guess. Without the proof the header is just attacker-supplied input.
export function hasTrustedPeerHeaders(request) {
  const token = process.env.KITSUNE_ROUTER_PEER_TOKEN;
  if (!token && process.env.NODE_ENV === "development" && !warnedDevMode) {
    warnedDevMode = true;
    console.warn(
      "[Security] KITSUNE_ROUTER_PEER_TOKEN is not set. If running 'next dev' directly without custom-server.js, peer trust is disabled (requests treated as non-local)."
    );
  }
  return Boolean(token) && request.headers.get("x-kitsune-router-peer-token") === token;
}
