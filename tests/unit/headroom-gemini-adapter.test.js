import { describe, expect, it, vi } from "vitest";
import { compressWithHeadroom, formatHeadroomLog } from "../../open-sse/rtk/headroom.js";

describe("compressWithHeadroom Gemini & Antigravity format (#4070)", () => {
  it("compresses plain text and functionResponse outputs in Gemini request envelope", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { role: "user", content: "Inspect this" },
          { role: "tool", content: "compacted log line 1\ncompacted log line 2", tool_call_id: "read_log" },
        ],
        tokens_before: 500,
        tokens_after: 100,
        tokens_saved: 400,
      }),
    }));

    globalThis.fetch = mockFetch;

    const body = {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Inspect this" }],
          },
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "read_log",
                  response: {
                    output: "very long raw log line 1\nvery long raw log line 2\nvery long raw log line 3",
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const diagnostics = {};
    const result = await compressWithHeadroom(body, {
      enabled: true,
      url: "http://localhost:8787",
      model: "gemini-3.8-flash",
      format: "antigravity",
      diagnostics,
    });

    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalled();
    const sentPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentPayload.messages).toHaveLength(2);
    expect(sentPayload.messages[1].role).toBe("tool");

    // Output should be replaced in-place
    expect(body.request.contents[1].parts[0].functionResponse.response.output).toBe(
      "compacted log line 1\ncompacted log line 2",
    );
  });

  it("handles alternative compressor stats formats (e.g. lean-ctx #4120)", () => {
    // lean-ctx format: stats: { original_tokens, compressed_tokens, saved_tokens }
    const leanCtxStats = {
      stats: {
        original_tokens: 1000,
        compressed_tokens: 200,
        saved_tokens: 800,
      },
    };
    const log = formatHeadroomLog(leanCtxStats);
    expect(log).toContain("reported token delta=800 before=1000 after=200 (80.0%)");
  });
});
