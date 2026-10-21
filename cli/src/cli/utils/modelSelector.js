const api = require("../api/client");
const { prompt } = require("./input");
const { clearScreen } = require("./display");

// Provider alias order: OAuth first, then Free, then API Key
const PROVIDER_ALIAS_ORDER = [
  "cc", "ag", "cx", "if", "qw", "gc", "gh", "kr", "oc",
  "openrouter", "glm", "kimi", "minimax", "openai", "anthropic", "gemini"
];

// Alias to display name mapping
const PROVIDER_ALIAS_NAMES = {
  cc: "Claude Code",
  ag: "Antigravity",
  cx: "OpenAI Codex",
  if: "iFlow AI",
  qw: "Qwen Code",
  gc: "Gemini CLI",
  gh: "GitHub Copilot",
  kr: "Kiro AI",
  oc: "OpenCode Free",
  opencode: "OpenCode Free",
  openrouter: "OpenRouter",
  glm: "GLM Coding",
  kimi: "Kimi Coding",
  minimax: "Minimax Coding",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini"
};

const PROVIDER_ID_TO_ALIAS = {
  claude: "cc",
  codex: "cx",
  "gemini-cli": "gc",
  github: "gh",
  antigravity: "ag",
  iflow: "if",
  qwen: "qw",
  kiro: "kr",
  cursor: "cu",
  cline: "cline",
  clinepass: "clinepass",
  qoder: "qd",
  "qoder-cn": "qd",
  gitlab: "gitlab",
  "codebuddy-cn": "cb",
  "codebuddy-intl": "cbai",
  kimchi: "kimchi",
  "grok-cli": "grok-cli",
  trae: "trae",
  windsurf: "windsurf",
  zed: "zed",
  opencode: "oc",
  "opencode-go": "ocg",
  "opencode-zen": "ocz",
};

// Providers usable without stored credentials
const NO_AUTH_PROVIDERS = new Set(["opencode", "oc"]);

/**
 * Get all available models grouped by provider + combos (filtered by active connections)
 * @returns {Promise<{combos: Array, groups: Object}>}
 */
async function getAvailableModelsGrouped() {
  const [modelsResult, providersResult] = await Promise.all([
    api.getAvailableModels(),
    api.getProviders()
  ]);

  if (!modelsResult.success) return { combos: [], groups: {} };

  const connections = providersResult.success ? (providersResult.data?.connections || []) : [];
  const activeAliases = new Set(NO_AUTH_PROVIDERS);

  connections.forEach(conn => {
    if (conn.isActive === false) return;
    const p = conn.provider;
    if (!p) return;
    activeAliases.add(p);
    const alias = conn.providerSpecificData?.prefix || PROVIDER_ID_TO_ALIAS[p] || p;
    activeAliases.add(alias);
  });

  const models = modelsResult.data?.data || [];
  const combos = [];
  const groups = Object.create(null);

  models.forEach(m => {
    if (m.owned_by === "combo") {
      combos.push(m.id);
    } else {
      const provider = m.owned_by;
      // Only keep connected providers or noAuth providers
      if (!activeAliases.has(provider)) return;
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(m.id);
    }
  });

  return { combos, groups };
}

/**
 * Display model list and prompt for selection
 * @param {string} title - Title to display
 * @param {string} currentValue - Current selected value (optional)
 * @param {Object} options - { excludeCombos?: boolean }
 * @returns {Promise<string|null>} Selected model ID or null if cancelled
 */
async function selectModelFromList(title, currentValue = "", options = {}) {
  const { excludeCombos = false } = options;
  const { combos: rawCombos, groups } = await getAvailableModelsGrouped();
  const combos = excludeCombos ? [] : rawCombos;

  const totalModels = combos.length + Object.values(groups).flat().length;
  if (totalModels === 0) {
    clearScreen();
    console.log(`\n🎯 ${title}`);
    console.log("=".repeat(50));
    console.log("\n  No connected providers found.");
    console.log("  Please connect a provider in Providers menu first.\n");
    console.log("  m. ✍️  Enter custom model ID");
    console.log("  0. Cancel\n");
    const act = await prompt("Select option (m/0): ");
    const trimmed = act.trim();
    if (trimmed.toLowerCase() === "m") {
      const custom = await prompt("Enter custom model ID: ");
      return custom.trim() || null;
    }
    return null;
  }
  
  // Build flat list for selection
  const allModels = [];
  
  // Display
  clearScreen();
  console.log(`\n🎯 ${title}`);
  console.log("=".repeat(50));
  if (currentValue) {
    console.log(`Current: ${currentValue}\n`);
  } else {
    console.log();
  }
  
  let idx = 1;
  
  // Combos first (skipped when excludeCombos is true)
  if (combos.length > 0) {
    console.log("[Combos]");
    combos.forEach(combo => {
      console.log(`  ${idx}. ${combo}`);
      allModels.push(combo);
      idx++;
    });
    console.log();
  }
  
  // Provider groups in order (by alias)
  const sortedProviders = Object.keys(groups).sort((a, b) => {
    const idxA = PROVIDER_ALIAS_ORDER.indexOf(a);
    const idxB = PROVIDER_ALIAS_ORDER.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
  
  sortedProviders.forEach(provider => {
    const providerName = Object.hasOwn(PROVIDER_ALIAS_NAMES, provider)
      ? PROVIDER_ALIAS_NAMES[provider]
      : provider;
    console.log(`[${providerName}]`);
    groups[provider].forEach(model => {
      console.log(`  ${idx}. ${model}`);
      allModels.push(model);
      idx++;
    });
    console.log();
  });
  
  console.log("  0. Cancel\n");
  
  // Prompt for number input
  const input = await prompt("Enter number: ");
  const num = parseInt(input, 10);
  
  if (isNaN(num) || num === 0 || num < 0 || num > allModels.length) {
    return null;
  }
  
  return allModels[num - 1];
}

module.exports = {
  selectModelFromList,
  getAvailableModelsGrouped,
  PROVIDER_ALIAS_ORDER,
  PROVIDER_ALIAS_NAMES
};
