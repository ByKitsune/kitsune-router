// Central config for remote-media fetching security limits.

// Max bytes accepted from a remote image fetch (reject larger to prevent memory DoS).
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// Fetch timeout for remote media.
export const FETCH_TIMEOUT_MS = 10000;

// Non-public destinations for unauthenticated remote image retrieval. Mapped
// IPv4 and the well-known NAT64 prefix are checked against the IPv4 policy.
export const BLOCKED_IMAGE_IPV4_RANGES = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
  "224.0.0.0/4", "240.0.0.0/4",
];
export const BLOCKED_IMAGE_IPV6_RANGES = [
  "::/96", "::ffff:0:0:0/96", "64:ff9b:1::/48", "100::/64",
  "2001:2::/48", "2001:db8::/32", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8",
];
export const IMAGE_EMBEDDED_IPV4_PREFIXES = ["::ffff:0:0", "64:ff9b::"];

// Magic-byte signatures -> mime. Each entry: { sig:[bytes], offset, mime }.
// offset>0 for containers where the signature is not at byte 0 (e.g. webp).
export const IMAGE_SIGNATURES = [
  { sig: [0x89, 0x50, 0x4e, 0x47], offset: 0, mime: "image/png" },
  { sig: [0xff, 0xd8, 0xff], offset: 0, mime: "image/jpeg" },
  { sig: [0x47, 0x49, 0x46, 0x38], offset: 0, mime: "image/gif" },
  { sig: [0x52, 0x49, 0x46, 0x46], offset: 0, mime: "image/webp", verifyWebp: true },
  { sig: [0x42, 0x4d], offset: 0, mime: "image/bmp" },
];

// Hostnames/IPs that must never be fetched (SSRF guard for loopback + cloud metadata).
export const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS/GCP/Azure IMDS
  "metadata.google.internal",
]);
