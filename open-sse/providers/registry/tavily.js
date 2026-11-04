import { WEB_FETCH_FORMATS } from "../../config/webFetchFormats.js";

export default {
  id: "tavily",
  alias: "tavily",
  display: {
    name: "Tavily",
    icon: "search",
    color: "#5B21B6",
    textIcon: "TV",
    website: "https://tavily.com",
    notice: {
      apiKeyUrl: "https://app.tavily.com/home"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webSearch",
    "webFetch"
  ],
  searchConfig: {
    baseUrl: "https://api.tavily.com/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.008,
    freeMonthlyQuota: 1000,
    searchTypes: [
      "web",
      "news"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 10000,
    cacheTTLMs: 300000
  },
  fetchConfig: {
    baseUrl: "https://api.tavily.com/extract",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    // Official unit is per 5 URLs (1 credit basic / 2 advanced), not per query.
    costPerQuery: 0.008,
    freeMonthlyQuota: 1000,
    formats: [...WEB_FETCH_FORMATS.tavily],
    maxCharacters: 100000,
    timeoutMs: 15000
  }
};
