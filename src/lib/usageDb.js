// Shim → re-export from new SQLite-based DB layer (src/lib/db/)
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, enqueueRequestUsage, flushUsageQueue, getUsageQueueMetrics,
  getUsageHistory, getUsageStats, getChartData,
  appendRequestLog, getRecentLogs,
  saveRequestDetail, getRequestDetails, getRequestDetailById,
  flushRequestDetails, getRequestDetailQueueMetrics,
} from "@/lib/db/index.js";
