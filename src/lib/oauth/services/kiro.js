import { KIRO_CONFIG, assertValidAwsRegion } from "../constants/oauth.js";
import { KIRO_USER_AGENT, KIRO_AMZ_USER_AGENT } from "open-sse/config/clientVersions.js";
import { isKiroToken, isKiroTokenResponse, kiroDeviceError, readKiroGrant, readKiroJson } from "../kiroResponse.js";

/**
 * Kiro OAuth Service
 * Supports multiple authentication methods:
 * 1. AWS Builder ID (Device Code Flow)
 * 2. AWS IAM Identity Center/IDC (Device Code Flow)
 * 3. Google/GitHub Social Login (Authorization Code Flow + Manual Callback)
 * 4. Import Token (Manual refresh token paste)
 */

const KIRO_AUTH_SERVICE = "https://prod.us-east-1.auth.desktop.kiro.dev";

export class KiroService {
  /**
   * Register OIDC client with AWS SSO
   * Returns clientId and clientSecret for device code flow
   */
  async registerClient(region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/client/register`;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientName: KIRO_CONFIG.clientName,
        clientType: KIRO_CONFIG.clientType,
        scopes: KIRO_CONFIG.scopes,
        grantTypes: KIRO_CONFIG.grantTypes,
        issuerUrl: KIRO_CONFIG.issuerUrl,
      }),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Failed to register client (HTTP ${response.status})`);
    }

    const data = await readKiroJson(response, "Client registration");
    if (!isKiroToken(data?.clientId) || !isKiroToken(data?.clientSecret)) {
      throw new Error("Client registration returned invalid credentials");
    }
    return {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      clientSecretExpiresAt: data.clientSecretExpiresAt,
    };
  }

  /**
   * Start device authorization for AWS Builder ID or IDC
   */
  async startDeviceAuthorization(clientId, clientSecret, startUrl, region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/device_authorization`;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl,
      }),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Failed to start device authorization (HTTP ${response.status})`);
    }

    const data = await readKiroJson(response, "Device authorization");
    if (!isKiroToken(data?.deviceCode) || !isKiroToken(data?.userCode)) {
      throw new Error("Device authorization returned invalid codes");
    }
    return {
      deviceCode: data.deviceCode,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      verificationUriComplete: data.verificationUriComplete,
      expiresIn: data.expiresIn,
      interval: data.interval || 5,
    };
  }

  /**
   * Poll for token using device code (AWS Builder ID/IDC)
   */
  async pollDeviceToken(clientId, clientSecret, deviceCode, region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode,
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    let data;
    try {
      data = await readKiroJson(response, "Device token request");
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const failure = kiroDeviceError(response);
      return { success: false, error: failure.error, errorDescription: failure.error_description, pending: false };
    }

    // Handle pending/slow_down/errors
    if (!response.ok || !isKiroTokenResponse(data)) {
      const failure = kiroDeviceError(response, data);
      return {
        success: false,
        error: failure.error,
        errorDescription: failure.error_description,
        pending: failure.error === "authorization_pending" || failure.error === "slow_down",
      };
    }

    return {
      success: true,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        tokenType: data.tokenType,
      },
    };
  }

  /**
   * Build Google/GitHub social login URL
   * Returns authorization URL for manual callback flow
   * Uses kiro:// custom protocol as required by AWS Cognito whitelist
   */
  buildSocialLoginUrl(provider, codeChallenge, state) {
    const idp = provider === "google" ? "Google" : "Github";
    // AWS Cognito only whitelists kiro:// protocol, not localhost
    const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";
    return `${KIRO_AUTH_SERVICE}/login?idp=${idp}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&prompt=select_account`;
  }

  /**
   * Exchange authorization code for tokens (Social Login)
   * Must use same redirect_uri as authorization request
   */
  async exchangeSocialCode(code, codeVerifier) {
    // Must match the redirect_uri used in buildSocialLoginUrl
    const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";

    const response = await fetch(`${KIRO_AUTH_SERVICE}/oauth/token`, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    const data = await readKiroGrant(response, "Token exchange");
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      profileArn: data.profileArn,
      expiresIn: data.expiresIn || 3600,
    };
  }

  /**
   * Refresh token using refresh token
   */
  async refreshToken(refreshToken, providerSpecificData = {}) {
    const { authMethod, clientId, clientSecret, region } = providerSpecificData;

    // AWS SSO OIDC refresh (Builder ID or IDC)
    if (clientId && clientSecret) {
      const safeRegion = region || "us-east-1";
      assertValidAwsRegion(safeRegion);
      const endpoint = `https://oidc.${safeRegion}.amazonaws.com/token`;

      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          refreshToken,
          grantType: "refresh_token",
        }),
      });

      const data = await readKiroGrant(response, "Token refresh");
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
        profileArn: data.profileArn,
        expiresIn: data.expiresIn,
      };
    }

    // Social auth refresh (Google/GitHub)
    const response = await fetch(`${KIRO_AUTH_SERVICE}/refreshToken`, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    const data = await readKiroGrant(response, "Token refresh");
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      profileArn: data.profileArn,
      expiresIn: data.expiresIn || 3600,
    };
  }

  /**
   * Validate and import refresh token
   */
  async validateImportToken(refreshToken) {
    // Validate token format
    if (!refreshToken.startsWith("aorAAAAAG")) {
      throw new Error("Invalid token format. Token should start with aorAAAAAG...");
    }

    // Try to refresh to validate
    try {
      const result = await this.refreshToken(refreshToken);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || refreshToken,
        profileArn: result.profileArn,
        expiresIn: result.expiresIn,
        authMethod: "imported",
      };
    } catch (error) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * List available CodeWhisperer profiles for OAuth/IDC tokens and return the
   * best-matching profileArn. API keys use the Amazon Q model catalog instead;
   * ListAvailableProfiles does not support TokenType=API_KEY.
   */
  async listAvailableProfiles(accessToken, region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://codewhisperer.${region}.amazonaws.com`;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "x-amz-target": "AmazonCodeWhispererService.ListAvailableProfiles",
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({ maxResults: 10 }),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Failed to list profiles (HTTP ${response.status})`);
    }

    const data = await readKiroJson(response, "Profile lookup");
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const arnOf = (p) => p?.arn || p?.profileArn || null;
    const match = profiles.find((p) => arnOf(p)?.split(":")[3] === region) || profiles[0];
    return arnOf(match);
  }

  /**
   * Validate an API key against the Amazon Q model catalog. A bearer-only call
   * to ListAvailableProfiles can return HTTP 200 with an empty list for an
   * arbitrary key, so it is not proof that the key can run inference.
   */
  async listAvailableApiKeyModels(apiKey, region = "us-east-1") {
    assertValidAwsRegion(region);
    const params = new URLSearchParams({ origin: "AI_EDITOR" });
    const endpoint = `https://q.${region}.amazonaws.com/ListAvailableModels?${params}`;
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "error",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "TokenType": "API_KEY",
        "Accept": "application/json",
        "User-Agent": KIRO_USER_AGENT,
        "X-Amz-User-Agent": KIRO_AMZ_USER_AGENT,
      },
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Failed to list API-key models (HTTP ${response.status})`);
    }

    const data = await readKiroJson(response, "API-key model lookup");
    const models = Array.isArray(data?.models) ? data.models : [];
    if (models.length === 0) {
      throw new Error("API key returned no available models");
    }
    return models;
  }

  /**
   * Validate an API-key credential through the same Amazon Q surface used for
   * inference. API keys are account-bound but do not require a profileArn.
   */
  async validateApiKey(apiKey, region = "us-east-1") {
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("API key is required");
    }
    const trimmed = apiKey.trim();

    try {
      await this.listAvailableApiKeyModels(trimmed, region);
    } catch (error) {
      throw new Error(`API key validation failed: ${error.message}`);
    }

    return {
      accessToken: trimmed,
      refreshToken: null,
      profileArn: null,
      region,
      authMethod: "api_key",
    };
  }

  /**
   * List available models from CodeWhisperer API
   */
  async listAvailableModels(accessToken, profileArn) {
    const endpoint = "https://codewhisperer.us-east-1.amazonaws.com";
    const target = "AmazonCodeWhispererService.ListAvailableModels";

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "x-amz-target": target,
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({
        origin: "AI_EDITOR",
        profileArn,
      }),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Failed to list models (HTTP ${response.status})`);
    }

    const data = await readKiroJson(response, "Model lookup");
    return (data.models || []).map(m => ({
      id: m.modelId,
      name: m.modelName || m.modelId,
      description: m.description,
      rateMultiplier: m.rateMultiplier,
      rateUnit: m.rateUnit,
      maxInputTokens: m.tokenLimits?.maxInputTokens || 0,
    }));
  }

  /**
   * Fetch user email from access token (optional, for display)
   */
  extractEmailFromJWT(accessToken) {
    try {
      const parts = accessToken.split(".");
      if (parts.length !== 3) return null;

      // Decode payload (add padding if needed)
      let payload = parts[1];
      while (payload.length % 4) {
        payload += "=";
      }

      const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return decoded.email || decoded.preferred_username || decoded.sub;
    } catch {
      return null;
    }
  }
}
