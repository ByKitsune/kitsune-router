import { describe, expect, it } from "vitest";
import { VertexExecutor } from "../../open-sse/executors/vertex.js";

// G04 source: decolua/9router@9c1419100c2c3db083e850f9572968d942fac7f9.
// These are real executor URLs, not a second implementation of the builder.
const model = "gemini-2.5-flash";
const modes = [
  { stream: false, action: "generateContent", query: "?key=fixture-key" },
  { stream: true, action: "streamGenerateContent", query: "?alt=sse&key=fixture-key" },
];

describe.each(modes)("Vertex routes (stream=$stream)", ({ stream, action, query }) => {
  it.each(["eu", "us", "global", "europe-west1"])("honors a raw-key project in %s", (location) => {
    const url = new VertexExecutor().buildUrl(model, stream, 0, {
      apiKey: "fixture-key", providerSpecificData: { projectId: "research-project", location },
    });
    expect(url).toBe(`https://aiplatform.googleapis.com/v1/projects/research-project/locations/${location}/publishers/google/models/gemini-2.5-flash:${action}${query}`);
  });

  it.each([undefined, null, ""])("defaults an explicit raw-key project to global when location=%s", (location) => {
    const url = new VertexExecutor().buildUrl(model, stream, 0, {
      apiKey: "fixture-key", providerSpecificData: { projectId: "research-project", location },
    });
    expect(url).toBe(`https://aiplatform.googleapis.com/v1/projects/research-project/locations/global/publishers/google/models/gemini-2.5-flash:${action}${query}`);
  });

  it.each([undefined, null, ""])("retains the legacy projectless route when project=%s", (projectId) => {
    const url = new VertexExecutor().buildUrl(model, stream, 0, {
      apiKey: "fixture-key", providerSpecificData: { projectId, location: "eu" },
    });
    expect(url).toBe(`https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:${action}${query}`);
  });

  it("accepts a numeric project number without changing its path segment", () => {
    const url = new VertexExecutor().buildUrl(model, stream, 0, {
      apiKey: "fixture-key", providerSpecificData: { projectId: "123456789012" },
    });
    expect(new URL(url).pathname).toBe(`/v1/projects/123456789012/locations/global/publishers/google/models/gemini-2.5-flash:${action}`);
  });

  it.each([
    { name: "access token", credentials: { accessToken: "fixture-token", providerSpecificData: { projectId: "oauth-project" } } },
    { name: "service account", credentials: { apiKey: JSON.stringify({ type: "service_account", client_email: "fixture@example.invalid", private_key: "not-a-real-key", project_id: "oauth-project" }) } },
    { name: "ADC", credentials: { apiKey: JSON.stringify({ type: "authorized_user", client_id: "fixture-client", client_secret: "fixture-secret", refresh_token: "fixture-refresh", quota_project_id: "oauth-project" }) } },
  ])("preserves the OAuth regional default for $name", ({ credentials }) => {
    const url = new VertexExecutor().buildUrl(model, stream, 0, credentials);
    expect(url).toBe(`https://aiplatform.googleapis.com/v1/projects/oauth-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:${action}${stream ? "?alt=sse" : ""}`);
    expect(new URL(url).searchParams.has("key")).toBe(false);
  });

  it.each(["eu", "us", "global", "asia-east1"])("retains explicit OAuth location %s and Bearer auth", (location) => {
    const executor = new VertexExecutor();
    const credentials = { accessToken: "fixture-token", providerSpecificData: { projectId: "oauth-project", location } };
    const url = executor.buildUrl(model, stream, 0, credentials);
    expect(new URL(url).pathname).toBe(`/v1/projects/oauth-project/locations/${location}/publishers/google/models/gemini-2.5-flash:${action}`);
    expect(executor.buildHeaders(credentials, stream)).toMatchObject({ Authorization: "Bearer fixture-token" });
  });

  it("keeps partner models on the global OpenAI endpoint", () => {
    const url = new VertexExecutor("vertex-partner").buildUrl("qwen/fixture-model", stream, 0, {
      apiKey: "fixture-key", providerSpecificData: { projectId: "partner-project", location: "eu" },
    });
    expect(url).toBe("https://aiplatform.googleapis.com/v1/projects/partner-project/locations/global/endpoints/openapi/chat/completions?key=fixture-key");
  });

  it("encodes a raw key as exactly one query value on Gemini and partner routes", () => {
    const apiKey = "fixture+key&alt=wrong&key=second#fragment%/?=雪";
    for (const provider of ["vertex", "vertex-partner"]) {
      for (const projectId of [undefined, "research-project"]) {
        if (provider === "vertex-partner" && !projectId) continue;
        const executor = new VertexExecutor(provider);
        const url = new URL(executor.buildUrl(model, stream, 0, { apiKey, providerSpecificData: { projectId } }));
        expect(url.origin).toBe("https://aiplatform.googleapis.com");
        expect(url.hash).toBe("");
        expect(url.searchParams.getAll("key")).toEqual([apiKey]);
        expect(url.searchParams.getAll("alt")).toEqual(provider === "vertex" && stream ? ["sse"] : []);
        expect([...url.searchParams.keys()]).toHaveLength(provider === "vertex" && stream ? 2 : 1);
        expect(executor.buildHeaders({ apiKey }, stream).Authorization).toBeUndefined();
      }
    }
  });
});

describe("Vertex route input safety", () => {
  it.each([
    ["projectId", "research-project/../../elsewhere"],
    ["projectId", "//attacker.invalid"],
    ["projectId", "research-project?key=injected"],
    ["projectId", "research-project#fragment"],
    ["projectId", "research-project%2flocations%2feu"],
    ["projectId", "research-project\\locations\\eu"],
    ["projectId", " research-project"],
    ["projectId", "Research_Project"],
    ["projectId", { secret: "fixture-secret" }],
    ["projectId", ["research-project"]],
    ["projectId", false],
    ["projectId", 0],
    ["location", "eu/publishers/attacker"],
    ["location", "eu?key=injected"],
    ["location", "eu#fragment"],
    ["location", "%2e%2e"],
    ["location", ".."],
    ["location", "eu.googleapis.com"],
    ["location", "eu\\elsewhere"],
    ["location", "eu\n"],
    ["location", { secret: "fixture-secret" }],
    ["location", ["eu"]],
    ["location", false],
    ["location", 0],
  ])("rejects malformed %s without exposing credentials (%j)", (field, value) => {
    for (const provider of ["vertex", "vertex-partner"]) {
      for (const auth of [{ apiKey: "fixture-secret-key" }, { accessToken: "fixture-secret-token" }]) {
        const credentials = { ...auth, providerSpecificData: { projectId: "research-project", location: "eu", [field]: value } };
        let error;
        try { new VertexExecutor(provider).buildUrl(model, true, 0, credentials); } catch (caught) { error = caught; }
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(field === "projectId" ? /project/i : /location/i);
        expect(error.message).not.toContain("fixture-secret");
        expect(error.message).not.toContain("attacker");
        expect(error.message).not.toContain("key=");
      }
    }
  });

  it.each(["../other?key=leak", "gemini#fragment", "gemini:generateContent", "gemini%2fforged", "gemini\\forged"])("rejects model path/query injection: %s", (unsafeModel) => {
    expect(() => new VertexExecutor().buildUrl(unsafeModel, true, 0, { apiKey: "fixture-secret-key" })).toThrow(/model/i);
  });

  it("requires a project for OAuth and partner routes", () => {
    expect(() => new VertexExecutor().buildUrl(model, false, 0, { accessToken: "fixture-secret-token" })).toThrow(/project/i);
    expect(() => new VertexExecutor("vertex-partner").buildUrl(model, false, 0, { apiKey: "fixture-secret-key" })).toThrow(/project/i);
  });
});
