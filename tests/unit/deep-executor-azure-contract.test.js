import { beforeEach, describe, expect, it, vi } from "vitest";
import { AzureExecutor } from "../../open-sse/executors/azure.js";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => network.fetch(...args) }));
beforeEach(() => { network.fetch.mockReset().mockResolvedValue(Response.json({ choices: [] })); });

function credentials(extra = {}) {
  return { apiKey: "synthetic-azure-key", providerSpecificData: { azureEndpoint: "https://azure-fixture.invalid", ...extra } };
}

describe("Azure native executor preserves explicit output caps on the actual request", () => {
  it.each(["gpt-5-mini", "gpt-6.1", "o4-mini"])("lowers max_tokens to the supported modern field for %s", async model => {
    network.fetch.mockResolvedValue(Response.json({ choices: [] }));
    const body = { messages: [{ role: "user", content: "A short result." }], max_tokens: 257 };
    const original = structuredClone(body);
    await new AzureExecutor().execute({ model, body, stream: false, credentials: credentials() });
    const sent = JSON.parse(network.fetch.mock.calls[0][1].body);
    expect(sent.max_completion_tokens).toBe(257);
    expect(sent).not.toHaveProperty("max_tokens");
    expect(body).toEqual(original);
    expect(network.fetch.mock.calls[0][1].headers["api-key"]).toBe("synthetic-azure-key");
  });

  it("keeps the explicit modern cap when both legacy and modern fields are supplied", async () => {
    network.fetch.mockResolvedValue(Response.json({ choices: [] }));
    await new AzureExecutor().execute({ model: "gpt-6.1", body: { messages: [], max_tokens: 9999, max_completion_tokens: 19 },
      stream: false, credentials: credentials() });
    const sent = JSON.parse(network.fetch.mock.calls[0][1].body);
    expect(sent.max_completion_tokens).toBe(19);
    expect(sent).not.toHaveProperty("max_tokens");
  });

  it("retains the legacy cap for an older deployment/model family", async () => {
    network.fetch.mockResolvedValue(Response.json({ choices: [] }));
    await new AzureExecutor().execute({ model: "gpt-4.1", body: { messages: [], max_tokens: 41 },
      stream: false, credentials: credentials() });
    const sent = JSON.parse(network.fetch.mock.calls[0][1].body);
    expect(sent.max_tokens).toBe(41);
    expect(sent).not.toHaveProperty("max_completion_tokens");
  });

  it("does not invent an output cap when the caller omitted it", async () => {
    network.fetch.mockResolvedValue(Response.json({ choices: [] }));
    await new AzureExecutor().execute({ model: "gpt-6.1", body: { messages: [] }, stream: false, credentials: credentials() });
    const sent = JSON.parse(network.fetch.mock.calls[0][1].body);
    expect(sent).not.toHaveProperty("max_tokens");
    expect(sent).not.toHaveProperty("max_completion_tokens");
  });

  it.each([0, -1, 0.5, "100"])("rejects an invalid native cap %j before dialing", async max_tokens => {
    const outcome = await new AzureExecutor().execute({ model: "gpt-6.1", body: { messages: [], max_tokens },
      stream: false, credentials: credentials() }).catch(error => error);
    expect(outcome).toMatchObject({ code: "invalid_output_budget", param: "max_tokens" });
    expect(network.fetch).not.toHaveBeenCalled();
  });
});

describe("Azure URL metadata remains data in the configured route", () => {
  it.each([".", ".."])("rejects the dot path segment %s before it can change the endpoint", async deployment => {
    const error = await new AzureExecutor().execute({ model: "gpt-4.1", body: { messages: [] }, stream: false,
      credentials: credentials({ deployment }) }).catch(error => error);
    expect(error).toMatchObject({ code: "unsupported_parameter", param: "deployment" });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("encodes deployment and API-version values without introducing new path/query controls", async () => {
    network.fetch.mockResolvedValue(Response.json({ choices: [] }));
    const deployment = "../other/deployment?api-version=changed#fragment";
    const apiVersion = "2024-10-01-preview&unrelated=enabled";
    await new AzureExecutor().execute({ model: "gpt-4.1", body: { messages: [] }, stream: false,
      credentials: credentials({ deployment, apiVersion }) });
    const url = new URL(network.fetch.mock.calls[0][0]);
    expect(url.origin).toBe("https://azure-fixture.invalid");
    expect(url.pathname).toBe(`/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`);
    expect(url.searchParams.get("api-version")).toBe(apiVersion);
    expect([...url.searchParams.keys()]).toEqual(["api-version"]);
    expect(url.hash).toBe("");
  });

  it("keeps ordinary supported deployment and API-version URL bytes unchanged", () => {
    expect(new AzureExecutor().buildUrl("gpt-4.1", false, 0,
      credentials({ deployment: "my-deployment_1", apiVersion: "2024-10-01-preview" })))
      .toBe("https://azure-fixture.invalid/openai/deployments/my-deployment_1/chat/completions?api-version=2024-10-01-preview");
  });
});
