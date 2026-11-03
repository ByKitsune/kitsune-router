import { ANTIGRAVITY_CONFIG, getOAuthClientMetadata } from "../constants/oauth.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "open-sse/config/runtimeConfig.js";

function extractProjectId(data) {
  const project = data?.cloudaicompanionProject;
  const id = typeof project === "string" ? project : project?.id;
  if (typeof id !== "string") return "";
  const normalized = id.trim();
  return normalized && !/\s/.test(normalized) ? normalized : "";
}

async function readOAuthJson(response, operation) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`${operation} failed (HTTP ${response.status})`);
  }
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error(`${operation} returned invalid JSON`);
  }
}

const antigravity = {
  config: ANTIGRAVITY_CONFIG,
  flowType: "authorization_code",
  buildAuthUrl: (config, redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: config.scopes.join(" "),
      state: state,
      access_type: "offline",
      prompt: "consent",
    });
    return `${config.authorizeUrl}?${params.toString()}`;
  },
  exchangeToken: async (config, code, redirectUri) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await readOAuthJson(response, "Token exchange");
    const validToken = value => typeof value === "string" && value.length > 0 && !/\s/.test(value);
    if (!validToken(tokens?.access_token) || (tokens.refresh_token != null && !validToken(tokens.refresh_token))
        || tokens.error || (tokens.expires_in !== undefined && (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0))
        || (tokens.token_type !== undefined && (typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer"))) {
      throw new Error("Token exchange returned an invalid token response");
    }
    return tokens;
  },
  postExchange: async (tokens) => {
    const signal = AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS);
    signal.throwIfAborted();
    const loadHeaders = {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      "User-Agent": ANTIGRAVITY_CONFIG.loadCodeAssistUserAgent,
      "x-request-source": "local",
    };
    const metadata = getOAuthClientMetadata();

    // Fetch user info
    const userInfoRes = await fetch(`${ANTIGRAVITY_CONFIG.userInfoUrl}?alt=json`, {
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "x-request-source": "local",
      },
    });
    const userInfo = await readOAuthJson(userInfoRes, "User information request");

    // Load Code Assist to get project ID and tier
    signal.throwIfAborted();
    const loadRes = await fetch(ANTIGRAVITY_CONFIG.loadCodeAssistEndpoint, {
      method: "POST",
      redirect: "error",
      signal,
      headers: loadHeaders,
      body: JSON.stringify({ metadata }),
    });
    const data = await readOAuthJson(loadRes, "Load Code Assist");
    if (data === null || typeof data !== "object" || Array.isArray(data) || data.error) {
      throw new Error("Load Code Assist returned an invalid response");
    }
    const projectId = extractProjectId(data);
    // An account that already has a real project needs no onboarding request.
    if (projectId) return { userInfo, projectId };

    let tierId = "legacy-tier";
    if (Array.isArray(data?.allowedTiers)) {
      for (const tier of data.allowedTiers) {
        if (tier?.isDefault === true && typeof tier.id === "string" && tier.id.trim()) {
          tierId = tier.id.trim();
          break;
        }
      }
    }

    // Only a successful pending operation may be polled. Denials and malformed
    // responses are terminal, and no onboarding work outlives this login call.
    for (let i = 0; i < 10; i++) {
      signal.throwIfAborted();
      const onboardRes = await fetch(ANTIGRAVITY_CONFIG.onboardUserEndpoint, {
        method: "POST",
        redirect: "error",
        signal,
        headers: loadHeaders,
        body: JSON.stringify({ tierId, metadata }),
      });
      const result = await readOAuthJson(onboardRes, "Antigravity onboarding");
      if (result?.error) throw new Error("Antigravity onboarding returned an error");
      if (result?.done === true) {
        const completedProjectId = extractProjectId(result.response);
        if (completedProjectId) return { userInfo, projectId: completedProjectId };
        throw new Error("Antigravity onboarding completed without a valid project");
      }
      if (result?.done !== false && !(result?.done === undefined && typeof result?.name === "string" && result.name.trim())) {
        throw new Error("Antigravity onboarding returned an invalid operation");
      }
      if (i < 9) await new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, 5000);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
    throw new Error("Antigravity onboarding did not complete");
  },
  mapTokens: (tokens, extra) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    email: extra?.userInfo?.email,
    projectId: extra?.projectId,
  }),
};

export default antigravity;
