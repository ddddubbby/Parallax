import { domainFromUrl, ProviderCallError } from "./shared";
import type { Citation } from "./types";

// Shared parsing for the OpenAI-style Responses API (POST /v1/responses).
// OpenAI, xAI and the Meta Model API all return the same shape: `message`
// output items whose `output_text` parts carry `url_citation` annotations,
// plus one `web_search_call` item per search the model ran (M63/D-143).
// Request construction and pricing stay in each adapter.
//
// A searching model can emit several `message` items (progress notes between
// searches, then the answer); they are kept verbatim (C-3) but separated by a
// blank line so the stored text never runs sentences together (D-145).

export interface ResponsesApiOutput {
  output?: Array<{
    type?: string;
    /** Meta: present on `web_search_call` items when `include: ["web_search_call.results"]` is sent. */
    results?: Array<{ url?: string; title?: string | null }>;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string | null }>;
    }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  /** xAI: every source URL the search tools encountered, returned by default. */
  citations?: Array<string | { url?: string; title?: string | null }>;
}

export interface ParsedResponsesOutput {
  text: string;
  citations: Citation[];
  searchCalls: number;
  tokensIn: number;
  tokensOut: number;
}

/**
 * xAI labels inline citations with their visible number ("1", "2", ...)
 * rather than a page title; a bare number is not a title and is dropped.
 */
function citationTitle(title: string | null | undefined): string | undefined {
  if (!title || /^\d+$/.test(title.trim())) return undefined;
  return title;
}

export function parseResponsesOutput(providerName: string, parsed: ResponsesApiOutput): ParsedResponsesOutput {
  const messageItems = (parsed.output ?? []).filter((item) => item.type === "message");
  const textParts = messageItems.flatMap((item) =>
    (item.content ?? []).filter((part) => part.type === "output_text"),
  );
  const text = messageItems
    .map((item) =>
      (item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join(""),
    )
    .filter((itemText) => itemText.length > 0)
    .join("\n\n");
  if (!text) {
    throw new ProviderCallError("malformed_output", `${providerName} response contained no output_text`);
  }

  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const part of textParts) {
    for (const annotation of part.annotations ?? []) {
      if (annotation.type !== "url_citation" || !annotation.url || seen.has(annotation.url)) continue;
      seen.add(annotation.url);
      citations.push({
        url: annotation.url,
        domain: domainFromUrl(annotation.url),
        title: citationTitle(annotation.title),
      });
    }
  }

  // Retrieved sources (D-145): the pages the search tools returned, merged
  // after the inline citations and deduplicated — the same rule Perplexity's
  // search_results and Gemini's groundingChunks already follow. Absent unless
  // the provider returns them (Meta on request, xAI by default).
  const retrieved: Array<{ url?: string; title?: string | null }> = [
    ...(parsed.output ?? []).flatMap((item) => (item.type === "web_search_call" ? (item.results ?? []) : [])),
    ...(parsed.citations ?? []).map((entry) => (typeof entry === "string" ? { url: entry } : entry)),
  ];
  for (const source of retrieved) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    citations.push({ url: source.url, domain: domainFromUrl(source.url), title: citationTitle(source.title) });
  }

  return {
    text,
    citations,
    searchCalls: (parsed.output ?? []).filter((item) => item.type === "web_search_call").length,
    tokensIn: parsed.usage?.input_tokens ?? 0,
    tokensOut: parsed.usage?.output_tokens ?? 0,
  };
}
