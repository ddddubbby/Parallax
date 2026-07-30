import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";

export interface PromptDisclosureData {
  testType: "buyer_response" | "ai_recommendation";
  state: "preview" | "frozen";
  protocolVersion: string | null;
  matrixVersion: number | null;
  parityVerified: boolean;
  currentMessage: { id: string; label: string; body: string } | null;
  newMessage: { id: string; label: string; body: string } | null;
  pairs: Array<{
    contextKey: string;
    contextLabel: string;
    currentPrompt: string;
    newPrompt: string;
    currentCellId?: string;
    newCellId?: string;
    currentResponseIds?: string[];
    newResponseIds?: string[];
  }>;
}

export function PromptDisclosurePanel({
  disclosure,
  compact = false,
}: {
  disclosure: PromptDisclosureData;
  compact?: boolean;
}) {
  const representative = disclosure.pairs[0] ?? null;

  return (
    <section className="space-y-4 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="label-mono text-sm font-semibold">Exact A/B prompts</h2>
        <Stamp tone={disclosure.state === "frozen" ? "ok" : "accent"}>
          {disclosure.state === "frozen" ? "FROZEN" : "PREVIEW"}
        </Stamp>
        <SimulatedBadge />
      </div>

      <p className="text-sm leading-6 text-ink/70">
        These are the complete request contents supplied by Resonance to the provider API. They do not
        include the provider&rsquo;s private system prompt, routing, or safety layers.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-paper p-3">
          <p className="label-mono mb-1 text-xs text-ink/55">Current message</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink/80">
            {disclosure.currentMessage?.body || "Choose a stored response first."}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-paper p-3">
          <p className="label-mono mb-1 text-xs text-ink/55">New message</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink/80">
            {disclosure.newMessage?.body || "Add the new message to compare."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Stamp tone={disclosure.parityVerified ? "ok" : "warn"}>
          {disclosure.parityVerified ? "Only the message changes" : "Parity not verified"}
        </Stamp>
        <span className="font-mono text-ink/60">
          {disclosure.testType === "buyer_response" ? "Buyer response" : "AI recommendation"}
          {disclosure.protocolVersion ? ` · ${disclosure.protocolVersion}` : ""}
          {disclosure.matrixVersion ? ` · matrix v${disclosure.matrixVersion}` : ""}
        </span>
      </div>

      {representative && (
        <details open={!compact} className="rounded-lg border border-ink/10 bg-paper p-3">
          <summary className="cursor-pointer label-mono text-xs text-ink/70">
            Representative pair · {representative.contextLabel}
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <PromptBlock label="Current prompt" text={representative.currentPrompt} />
            <PromptBlock label="New prompt" text={representative.newPrompt} />
          </div>
          <PromptIds pair={representative} />
        </details>
      )}

      {disclosure.pairs.length > 1 && (
        <details className="rounded-lg border border-ink/10 bg-paper p-3">
          <summary className="cursor-pointer label-mono text-xs text-ink/70">
            Inspect every exact prompt ({disclosure.pairs.length} contexts)
          </summary>
          <div className="mt-3 space-y-3">
            {disclosure.pairs.map((pair) => (
              <details key={pair.contextKey} className="rounded-md border border-ink/10 p-3">
                <summary className="cursor-pointer text-sm text-ink/75">{pair.contextLabel}</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <PromptBlock label="Current prompt" text={pair.currentPrompt} />
                  <PromptBlock label="New prompt" text={pair.newPrompt} />
                </div>
                <PromptIds pair={pair} />
              </details>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function PromptIds({
  pair,
}: {
  pair: PromptDisclosureData["pairs"][number];
}) {
  if (!pair.currentCellId && !pair.newCellId) return null;
  return (
    <p className="mt-3 break-all font-mono text-[11px] leading-5 text-ink/50">
      Current cell: {pair.currentCellId ?? "preview"} · responses:{" "}
      {pair.currentResponseIds?.join(", ") || "none yet"}
      <br />
      New cell: {pair.newCellId ?? "preview"} · responses:{" "}
      {pair.newResponseIds?.join(", ") || "none yet"}
    </p>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="label-mono mb-1 text-xs text-ink/50">{label}</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-paper-2 p-3 font-mono text-xs leading-5 text-ink/75">
        {text}
      </pre>
    </div>
  );
}
