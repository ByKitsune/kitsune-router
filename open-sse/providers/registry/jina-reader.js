import { WEB_FETCH_FORMATS } from "../../config/webFetchFormats.js";

export default {
  id: "jina-reader",
  alias: "jina-reader",
  display: {
    name: "Jina Reader",
    icon: "menu_book",
    color: "#000000",
    textIcon: "JR",
    website: "https://jina.ai/reader",
    notice: {
      apiKeyUrl: "https://jina.ai/?sui=apikey"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webFetch"
  ],
  fetchConfig: {
    baseUrl: "https://r.jina.ai",
    method: "GET",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0,
    // Official: 10M-token ONE-TIME signup grant (not monthly); field kept for UI compat.
    freeMonthlyQuota: 10000000,
    formats: [...WEB_FETCH_FORMATS["jina-reader"]],
    maxCharacters: 200000,
    timeoutMs: 30000
  }
};
