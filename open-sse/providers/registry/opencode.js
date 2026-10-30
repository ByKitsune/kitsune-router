export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    noAuth: true,
  },
  models: [
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses" },
    // Only documented Chat routes. The SystemOne/Jev wire is not implemented here.
    { id: "deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash Free", targetFormat: "openai", supportedFormats: ["openai"] },
    { id: "minimax-m3.1-flash-free", name: "MiniMax M3.1 Flash Free", targetFormat: "openai", supportedFormats: ["openai"] },
    // Muse models use /zen/v1/responses; the documented free additions below
    // use /chat/completions, so format remains a per-model declaration.
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses" },
    // Exact hosted IDs and Chat Completions routes verified in the provider docs.
    { id: "fledge-alpha-free", name: "Fledge Alpha Free", targetFormat: "openai", supportedFormats: ["openai"] },
    { id: "ling-3.1-flash-free", name: "Ling 3.1 Flash Free", targetFormat: "openai", supportedFormats: ["openai"] },
    { id: "longcat-2.5-preview-free", name: "LongCat 2.5 Preview Free", targetFormat: "openai", supportedFormats: ["openai"] },
    { id: "space-bunny-free", name: "Space Bunny Free", targetFormat: "openai", supportedFormats: ["openai"] },
    { id: "mimo-v2.6-flash-free", name: "MiMo-V2.6-Flash Free", targetFormat: "openai", supportedFormats: ["openai"] },
    // Exact hosted routes from official OpenCode v1.19.5 documentation.
    {"id": "cat-jam-free", "name": "Cat Jam Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "step-5-preview-free", "name": "Step 5 Preview Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "exo-free", "name": "Exo Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "mimo-v2.5-free", "name": "MiMo-V2.5 Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "ling-3.0-flash-fin-free", "name": "Ling 3.0 Flash Fin Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "nemotron-3-ultra-free", "name": "Nemotron 3 Ultra Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
    {"id": "nemotron-3.5-lightning-free", "name": "Nemotron 3.5 Lightning Free", "targetFormat": "openai", "supportedFormats": ["openai"]},
  ],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
