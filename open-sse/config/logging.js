export const LOG_FORMAT_LIMITS = Object.freeze({
  maxBytes: 8 * 1024,
  maxInputChars: 32 * 1024,
  maxDepth: 4,
  maxEntries: 40,
});

export const CONSOLE_CAPTURE_LIMITS = Object.freeze({
  maxBytes: 512 * 1024,
  flushIntervalMs: 100,
  batchLines: 50,
  listenerCap: 50,
  listenerWarnAt: 40,
});

export const REQUEST_LOG_STREAM_MAX_BYTES = 64 * 1024;

export const REQUEST_DETAIL_QUERY_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 100,
});
