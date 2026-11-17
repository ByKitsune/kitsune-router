import { BRAND } from "../../../branding/identity.mjs";
import { getOpenCodeRegistryModel, isFreeOpenCodeModel, openCodeTransports } from "../../config/opencodeCatalog.js";
import { openCodeZenCatalog } from "../metadata/opencodeCatalogData.js";

const transports = openCodeTransports("zen", { "User-Agent": BRAND.binary });

export default {
  id: "opencode-zen",
  alias: "opencode-zen",
  priority: 210,
  category: "apikey",
  display: {
    name: "OpenCode Zen", icon: "terminal", color: "#E87040", textIcon: "OC",
    website: "https://opencode.ai/zen",
    notice: { apiKeyUrl: "https://opencode.ai/auth" },
  },
  transport: { ...transports.find(({ format }) => format === "openai"), authProbeModel: "deepseek-v4.1-flash" },
  transports,
  models: openCodeZenCatalog.models.filter(model => !isFreeOpenCodeModel(model)).map(getOpenCodeRegistryModel),
};
