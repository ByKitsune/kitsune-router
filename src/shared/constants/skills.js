// Agent Skills metadata — single source of truth for /dashboard/skills page.
// Each skill = 1 raw GitHub URL the user copies and pastes to any AI agent.

const REPO = "ByKitsune/kitsune-router";
const BRANCH = "master";
const SKILL_PATH = "skills";

export const SKILLS_REPO_URL = `https://github.com/${REPO}`;
export const SKILLS_RAW_BASE = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/${SKILL_PATH}`;
export const SKILLS_BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/${SKILL_PATH}`;

export const SKILLS = [
  {
    id: "kitsune-router",
    name: "Kitsune Router (Entry)",
    description: "Start here: connect securely, check gateway health, discover configured routes and load the relevant capability guide.",
    endpoint: null,
    icon: "alt_route",
    isEntry: true,
  },
  {
    id: "kitsune-router-chat",
    name: "Chat",
    description: "Authorized chat and code generation with discovered models, JSON/SSE handling, tools and bounded cancellation.",
    endpoint: "/v1/chat/completions",
    icon: "chat",
  },
  {
    id: "kitsune-router-image",
    name: "Image Generation",
    description: "Discover image routes and model-specific controls; validate returned image formats before saving.",
    endpoint: "/v1/images/generations",
    icon: "image",
  },
  {
    id: "kitsune-router-video",
    name: "Video Generation",
    description: "Create an authorized video job once, preserve its connection scope and poll within a fixed deadline.",
    endpoint: "/v1/videos/generations",
    icon: "movie",
  },
  {
    id: "kitsune-router-tts",
    name: "Text-to-Speech",
    description: "Discover voices and supported speech controls; save verified audio without mistaking errors for media.",
    endpoint: "/v1/audio/speech",
    icon: "record_voice_over",
  },
  {
    id: "kitsune-router-stt",
    name: "Speech-to-Text",
    description: "Upload authorized audio, inspect transcription support and preserve the returned text or timed output.",
    endpoint: "/v1/audio/transcriptions",
    icon: "mic",
  },
  {
    id: "kitsune-router-embeddings",
    name: "Embeddings",
    description: "Discover embedding routes, preserve input ordering and validate dimensions before indexing.",
    endpoint: "/v1/embeddings",
    icon: "scatter_plot",
  },
  {
    id: "kitsune-router-web-search",
    name: "Web Search",
    description: "Bounded web or public X research with discovered providers, citations, pagination and explicit costs.",
    endpoint: "/v1/search",
    icon: "search",
  },
  {
    id: "kitsune-router-web-fetch",
    name: "Web Fetch",
    description: "Extract public pages with the correct provider selector, bounded content and untrusted-data handling.",
    endpoint: "/v1/web/fetch",
    icon: "language",
  },
];

export function getSkillRawUrl(id) {
  return `${SKILLS_RAW_BASE}/${id}/SKILL.md`;
}

export function getSkillBlobUrl(id) {
  return `${SKILLS_BLOB_BASE}/${id}/SKILL.md`;
}
