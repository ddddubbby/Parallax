// Route-level loading skeleton (Next.js loading.tsx boundaries). Every
// data page is force-dynamic with real DB queries, so without this the app
// simply freezes after a nav click until the server answers — the largest
// single source of "did my click work?" anxiety. Dossier-voiced per
// DESIGN_GUIDELINES §10; pulse is opacity-only and dies with the skeleton
// (§7), and the global prefers-reduced-motion rule disables it entirely.

const BLOCK_WIDTHS = ["w-2/3", "w-full", "w-5/6"];

export function PageLoading({ surface = "paper" }: { surface?: "paper" | "ink" }) {
  const block = surface === "paper" ? "bg-ink/10" : "bg-paper/10";
  const label = surface === "paper" ? "text-ink/45" : "text-paper/45";

  return (
    <main
      className={`mx-auto max-w-5xl px-6 py-8 ${surface === "ink" ? "min-h-screen bg-ink" : ""}`}
      aria-busy="true"
    >
      <p className={`label-mono mb-6 text-xs ${label}`}>Loading…</p>
      <div className="loading-pulse flex flex-col gap-3" role="presentation">
        <div className={`h-6 w-48 rounded-lg ${block}`} />
        {BLOCK_WIDTHS.map((w) => (
          <div key={w} className={`h-24 rounded-xl ${w} ${block}`} />
        ))}
      </div>
    </main>
  );
}
