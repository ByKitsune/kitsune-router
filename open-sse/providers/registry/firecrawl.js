import { WEB_FETCH_FORMATS } from "../../config/webFetchFormats.js";

export default {
  id: "firecrawl",
  alias: "firecrawl",
  display: {
    name: "Firecrawl",
    icon: "local_fire_department",
    color: "#F59E0B",
    textIcon: "FC",
    website: "https://firecrawl.dev",
    notice: {
      apiKeyUrl: "https://www.firecrawl.dev/app/api-keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webFetch"
  ],
  fetchConfig: {
    baseUrl: "https://api.firecrawl.dev/v2/scrape",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.002,
    freeMonthlyQuota: 1000,
    formats: [...WEB_FETCH_FORMATS.firecrawl],
    maxCharacters: 200000,
    timeoutMs: 30000
  }
};
