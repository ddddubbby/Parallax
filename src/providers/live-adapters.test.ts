import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import { createGoogleProvider } from "./google";
import { createMetaProvider } from "./meta";
import { createOpenAIProvider } from "./openai";
import { createOpenAIEmbeddingProvider } from "./openai/embeddings";
import { createPerplexityProvider } from "./perplexity";
import { ProviderCallError } from "./shared";
import { createXaiProvider } from "./xai";

// M9 adapters, network fully stubbed. Response shapes verified against
// official docs 2026-07-03 (PV-7) — these fixtures mirror the documented
// structures exactly, so a test failure means OUR parsing drifted, while a
// live-API drift would surface as malformed_output/empty citations in a
// validation run, never silently.

const CREDS = { apiKey: "sk-test" };

function stubFetch(body: unknown, status = 200) {
  // The args tuple types spy.mock.calls so tests can inspect request bodies.
  const spy = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
    void args;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI adapter (Responses API)", () => {
  const groundedResponse = {
    output: [
      { type: "web_search_call", id: "ws_1", status: "completed" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "LedgerFox is a popular bookkeeping tool.",
            annotations: [
              { type: "url_citation", url: "https://reviews.example/ledgerfox", title: "LedgerFox review" },
              { type: "url_citation", url: "https://reviews.example/ledgerfox", title: "duplicate — must dedupe" },
            ],
          },
        ],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 40 },
    model: "gpt-5.5",
  };

  it("parses text, normalizes url_citation annotations with dedupe, and bills web_search_call usage", async () => {
    const spy = stubFetch(groundedResponse);
    const provider = createOpenAIProvider(CREDS);
    const result = await provider.generate({ promptText: "best bookkeeping tools?", mode: "grounded" });

    expect(result.text).toContain("LedgerFox");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toEqual({
      url: "https://reviews.example/ledgerfox",
      domain: "reviews.example",
      title: "LedgerFox review",
    });
    // token cost + one web_search_call at $0.01
    expect(result.costUsd).toBeCloseTo((120 / 1e6) * 5 + (40 / 1e6) * 30 + 0.01, 8);

    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.tools).toEqual([{ type: "web_search" }]);
    // D-144: low reasoning effort, stamped onto the stored model version.
    expect(requestBody.reasoning).toEqual({ effort: "low" });
    expect(result.modelVersion).toBe("gpt-5.5 (effort: low)");
  });

  it("omits the web_search tool for ungrounded mode", async () => {
    const spy = stubFetch({ output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }], usage: {} });
    await createOpenAIProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" });
    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.tools).toBeUndefined();
  });

  it("throws malformed_output when no output_text exists", async () => {
    stubFetch({ output: [], usage: {} });
    await expect(createOpenAIProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" })).rejects.toMatchObject({
      errorType: "malformed_output",
    });
  });

  it("maps a 401 through the shared HTTP classifier", async () => {
    stubFetch({ error: "debug echo Authorization: Bearer sk-test" }, 401);
    await expect(createOpenAIProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" })).rejects.toMatchObject({
      errorType: "auth_error",
      message: "OpenAI returned HTTP 401 (auth_error)",
    });
  });
});

describe("OpenAI embedding adapter", () => {
  it("posts text batches to /v1/embeddings, preserves vector order, and records token cost", async () => {
    const spy = stubFetch({
      data: [
        { index: 1, embedding: [0, 1, 0] },
        { index: 0, embedding: [1, 0, 0] },
      ],
      usage: { prompt_tokens: 12, total_tokens: 12 },
      model: "text-embedding-3-small",
    });
    const provider = createOpenAIEmbeddingProvider(CREDS);
    const result = await provider.embed({ texts: ["buyer reaction", "anchor sentence"] });

    expect(result.vectors).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(result.tokens).toBe(12);
    expect(result.costUsd).toBeCloseTo((12 / 1e6) * 0.02, 10);

    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody).toMatchObject({ model: "text-embedding-3-small", input: ["buyer reaction", "anchor sentence"] });
  });

  it("does not reuse the OpenAI generation model override for embeddings", async () => {
    const spy = stubFetch({
      data: [{ index: 0, embedding: [1, 0, 0] }],
      usage: { total_tokens: 4 },
      model: "text-embedding-3-small",
    });
    const provider = createOpenAIEmbeddingProvider({ ...CREDS, defaultModel: "gpt-5.5" });
    expect(provider.defaultModel).toBe("text-embedding-3-small");

    await provider.embed({ texts: ["buyer reaction"] });

    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.model).toBe("text-embedding-3-small");
  });
});

describe("Anthropic adapter (Messages API)", () => {
  const groundedResponse = {
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "ledgerfox" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [{ type: "web_search_result", url: "https://ledgerfox.example", title: "LedgerFox" }],
      },
      {
        type: "text",
        text: "LedgerFox handles small-business bookkeeping.",
        citations: [
          {
            type: "web_search_result_location",
            url: "https://ledgerfox.example/features",
            title: "LedgerFox features",
            cited_text: "LedgerFox handles...",
          },
        ],
      },
    ],
    usage: { input_tokens: 200, output_tokens: 80, server_tool_use: { web_search_requests: 2 } },
    model: "claude-sonnet-5",
  };

  it("parses text blocks, takes citations from web_search_result_location entries, and bills searches", async () => {
    const spy = stubFetch(groundedResponse);
    const provider = createAnthropicProvider(CREDS);
    const result = await provider.generate({ promptText: "best bookkeeping tools?", mode: "grounded" });

    expect(result.text).toContain("LedgerFox");
    expect(result.citations).toEqual([
      { url: "https://ledgerfox.example/features", domain: "ledgerfox.example", title: "LedgerFox features" },
    ]);
    expect(result.costUsd).toBeCloseTo((200 / 1e6) * 3 + (80 / 1e6) * 15 + 2 * 0.01, 8);

    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.tools[0].type).toBe("web_search_20250305");
    expect(requestBody.max_tokens).toBeGreaterThan(0); // required by the API
    expect(requestBody.output_config).toEqual({ effort: "low" }); // D-144
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws malformed_output when the response has no text blocks", async () => {
    stubFetch({ content: [], usage: {} });
    await expect(createAnthropicProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" })).rejects.toMatchObject({
      errorType: "malformed_output",
    });
  });
});

describe("Gemini adapter (generateContent)", () => {
  const groundedResponse = {
    candidates: [
      {
        content: { parts: [{ text: "LedgerFox is well regarded." }] },
        groundingMetadata: {
          webSearchQueries: ["ledgerfox reviews"],
          groundingChunks: [
            { web: { uri: "https://finance.example/tools", title: "finance.example" } },
            { web: { uri: "https://finance.example/tools", title: "dupe" } },
          ],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 30 },
    modelVersion: "gemini-2.5-flash",
  };

  it("parses candidate text, normalizes groundingChunks, and bills the grounded prompt fee when the model searched", async () => {
    const spy = stubFetch(groundedResponse);
    const provider = createGoogleProvider(CREDS);
    const result = await provider.generate({ promptText: "best bookkeeping tools?", mode: "grounded" });

    expect(result.text).toContain("LedgerFox");
    expect(result.citations).toEqual([
      { url: "https://finance.example/tools", domain: "finance.example", title: "finance.example" },
    ]);
    expect(result.costUsd).toBeCloseTo((90 / 1e6) * 0.3 + (30 / 1e6) * 2.5 + 0.035, 8);

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("/v1beta/models/gemini-2.5-flash:generateContent");
    const requestBody = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.tools).toEqual([{ google_search: {} }]);
    // D-144: Gemini 2.5 has no effort levels; 1,024 thinking tokens is "low".
    expect(requestBody.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("sk-test");
  });

  it("degrades to empty citations (not a crash) when groundingMetadata is absent — the documented-shape caveat", async () => {
    stubFetch({
      candidates: [{ content: { parts: [{ text: "answered without searching" }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
    const result = await createGoogleProvider(CREDS).generate({ promptText: "x", mode: "grounded" });
    expect(result.citations).toEqual([]);
    expect(result.costUsd).toBeCloseTo((10 / 1e6) * 0.3 + (5 / 1e6) * 2.5, 8); // no search → no grounding fee
  });
});

describe("Perplexity adapter (sonar)", () => {
  it("rejects ungrounded mode without touching the network — grounded-only provider (PV-5)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(
      createPerplexityProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" }),
    ).rejects.toMatchObject({ errorType: "unsupported_mode" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses content, merges search_results (titled) with bare citation URLs, dedupes, and adds the request fee", async () => {
    const spy = stubFetch({
      choices: [{ message: { content: "LedgerFox leads the category." } }],
      citations: ["https://a.example/post", "https://b.example/review"],
      search_results: [{ title: "A post", url: "https://a.example/post" }],
      usage: { prompt_tokens: 50, completion_tokens: 25 },
      model: "sonar",
    });
    const result = await createPerplexityProvider(CREDS).generate({ promptText: "best tools?", mode: "grounded" });

    expect(result.citations).toEqual([
      { url: "https://a.example/post", domain: "a.example", title: "A post" },
      { url: "https://b.example/review", domain: "b.example" },
    ]);
    expect(result.costUsd).toBeCloseTo((50 / 1e6) * 1 + (25 / 1e6) * 1 + 0.008, 8);

    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://api.perplexity.ai/v1/sonar");
  });

  it("throws malformed_output on a missing message content", async () => {
    stubFetch({ choices: [], usage: {} });
    await expect(createPerplexityProvider(CREDS).generate({ promptText: "x", mode: "grounded" })).rejects.toMatchObject({
      errorType: "malformed_output",
    });
  });
});

// M63/D-143 adapters. Shapes verified against docs.x.ai and dev.meta.ai
// 2026-09-29: both are OpenAI-style Responses APIs.
describe("xAI adapter (Grok, Responses API)", () => {
  const groundedResponse = {
    output: [
      { type: "web_search_call", id: "ws_1", status: "completed" },
      { type: "web_search_call", id: "ws_2", status: "completed" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "LedgerFox is a popular bookkeeping tool [[1]](https://reviews.example/ledgerfox).",
            // xAI labels inline citations with their visible number, not a page title.
            annotations: [
              { type: "url_citation", url: "https://reviews.example/ledgerfox", title: "1", start_index: 40, end_index: 80 },
              { type: "url_citation", url: "https://reviews.example/ledgerfox", title: "1", start_index: 90, end_index: 99 },
            ],
          },
        ],
      },
    ],
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    model: "grok-4.7",
  };

  it("posts to /v1/responses with the web_search tool and parses deduped citations without numeric titles", async () => {
    const spy = stubFetch(groundedResponse);
    const result = await createXaiProvider(CREDS).generate({ promptText: "best bookkeeping tools?", mode: "grounded" });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://api.x.ai/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "grok-4.7",
      input: "best bookkeeping tools?",
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
    });
    expect(result.citations).toEqual([
      { url: "https://reviews.example/ledgerfox", domain: "reviews.example", title: undefined },
    ]);
    expect(result.modelVersion).toBe("grok-4.7 (effort: low)");
    // $2 in + $6 out per 1M tokens, plus two searches at $5 / 1k.
    expect(result.costUsd).toBeCloseTo(2 + 6 + 2 * 0.005, 6);
  });

  it("bills at least one search for a cited answer even when no web_search_call item is returned", async () => {
    stubFetch({ ...groundedResponse, output: groundedResponse.output.slice(2), usage: { input_tokens: 0, output_tokens: 0 } });
    const result = await createXaiProvider(CREDS).generate({ promptText: "x", mode: "grounded" });
    expect(result.costUsd).toBeCloseTo(0.005, 6);
  });

  it("omits tools for ungrounded mode and raises a tiny output cap to the reasoning floor", async () => {
    const spy = stubFetch(groundedResponse);
    await createXaiProvider(CREDS).generate({ promptText: "Reply OK", mode: "ungrounded", maxOutputTokens: 16 });
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.tools).toBeUndefined();
    expect(body.max_output_tokens).toBe(1024);
  });

  it("merges xAI's top-level citations list after inline citations, deduplicated (D-145)", async () => {
    stubFetch({ ...groundedResponse, citations: ["https://reviews.example/ledgerfox", "https://x.example/post"] });
    const result = await createXaiProvider(CREDS).generate({ promptText: "x", mode: "grounded" });
    expect(result.citations.map((c) => c.url)).toEqual(["https://reviews.example/ledgerfox", "https://x.example/post"]);
  });

  it("maps a 401 through the shared HTTP classifier", async () => {
    stubFetch({ error: "bad key" }, 401);
    await expect(createXaiProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" })).rejects.toMatchObject({
      errorType: "auth_error",
    });
  });
});

describe("Meta Model API adapter (Muse Spark, Responses API)", () => {
  const groundedResponse = {
    output: [
      { id: "ws_789", type: "web_search_call", status: "completed" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "LedgerFox and Tallyo are both well reviewed.",
            annotations: [
              { type: "url_citation", url: "https://reviews.example/ledgerfox", title: "LedgerFox review", start_index: 0, end_index: 9 },
              { type: "url_citation", url: "https://shop.example/tallyo", title: "Tallyo", start_index: 14, end_index: 20 },
            ],
          },
        ],
      },
    ],
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    model: "muse-spark-1.3",
  };

  it("posts to api.meta.ai/v1/responses with web_search and parses titled citations", async () => {
    const spy = stubFetch(groundedResponse);
    const result = await createMetaProvider(CREDS).generate({ promptText: "best bookkeeping tools?", mode: "grounded" });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://api.meta.ai/v1/responses");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "muse-spark-1.3",
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
    });
    expect(result.modelVersion).toBe("muse-spark-1.3 (effort: low)");
    expect(result.citations).toEqual([
      { url: "https://reviews.example/ledgerfox", domain: "reviews.example", title: "LedgerFox review" },
      { url: "https://shop.example/tallyo", domain: "shop.example", title: "Tallyo" },
    ]);
    // $1.25 in + $4.25 out per 1M tokens, plus one search at $2.50 / 1k.
    expect(result.costUsd).toBeCloseTo(1.25 + 4.25 + 0.0025, 6);
  });

  it("throws malformed_output when no output_text exists", async () => {
    stubFetch({ output: [{ type: "web_search_call" }], usage: {} });
    await expect(createMetaProvider(CREDS).generate({ promptText: "x", mode: "grounded" })).rejects.toMatchObject({
      errorType: "malformed_output",
    });
  });

  it("requests search results, merges them after inline citations, and separates progress notes from the answer (D-145)", async () => {
    const spy = stubFetch({
      output: [
        { type: "message", content: [{ type: "output_text", text: "I'll search for jewellers." }] },
        {
          type: "web_search_call",
          status: "completed",
          results: [
            { type: "web_search_result", url: "https://reviews.example/ledgerfox", title: "dup of inline", snippet: "…" },
            { type: "web_search_result", url: "https://guide.example/best", title: "Best picks", snippet: "…" },
          ],
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "LedgerFox is a good pick.",
              annotations: [{ type: "url_citation", url: "https://reviews.example/ledgerfox", title: "LedgerFox review" }],
            },
          ],
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const result = await createMetaProvider(CREDS).generate({ promptText: "x", mode: "grounded" });

    expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).include).toEqual(["web_search_call.results"]);
    expect(result.text).toBe("I'll search for jewellers.\n\nLedgerFox is a good pick.");
    expect(result.citations).toEqual([
      { url: "https://reviews.example/ledgerfox", domain: "reviews.example", title: "LedgerFox review" },
      { url: "https://guide.example/best", domain: "guide.example", title: "Best picks" },
    ]);
  });

  it("does not request search results for ungrounded calls", async () => {
    const spy = stubFetch(groundedResponse);
    await createMetaProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" });
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).include).toBeUndefined();
  });

  it("estimates grounded calls from live evidence: 40k input, 3k output, 8 searches (D-145)", () => {
    const estimate = createMetaProvider(CREDS).estimateCostUsd({ promptText: "short prompt", mode: "grounded" });
    expect(estimate).toBeCloseTo((40_000 / 1e6) * 1.25 + (3_000 / 1e6) * 4.25 + 8 * 0.0025, 6);
  });

  it("raises a tiny output cap to the reasoning floor so Settings Verify can succeed", async () => {
    const spy = stubFetch(groundedResponse);
    await createMetaProvider(CREDS).generate({ promptText: "Reply OK", mode: "ungrounded", maxOutputTokens: 16 });
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).max_output_tokens).toBe(1024);
  });
});

describe("shared timeout mapping", () => {
  it("maps TimeoutError from AbortSignal.timeout to the timeout error type for the new adapters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      }),
    );
    await expect(createOpenAIProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" })).rejects.toBeInstanceOf(
      ProviderCallError,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      }),
    );
    await expect(
      createGoogleProvider(CREDS).generate({ promptText: "x", mode: "ungrounded" }),
    ).rejects.toMatchObject({ errorType: "timeout" });
  });
});
