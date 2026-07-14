// Route-level dossier loading state (Next.js loading.tsx boundaries). Every
// data page is force-dynamic with real DB queries, so without this the app
// simply freezes after a nav click until the server answers — the largest
// single source of "did my click work?" anxiety. Dossier-voiced per
// DESIGN_GUIDELINES §10. Static dossier lines preserve context without a
// decorative or indefinite skeleton pulse.

export function PageLoading({
  surface = "paper",
  label = "Preparing this view",
}: {
  surface?: "paper" | "ink";
  label?: string;
}) {
  const line = surface === "paper" ? "border-ink/15" : "border-paper/15";
  const labelTone = surface === "paper" ? "text-ink/45" : "text-paper/45";

  return (
    <main
      className={`mx-auto max-w-5xl px-6 py-8 ${surface === "ink" ? "min-h-screen bg-ink" : ""}`}
      aria-busy="true"
      aria-label={label}
    >
      <p className={`label-mono mb-5 text-xs ${labelTone}`}>{label}…</p>
      <div className="max-w-2xl space-y-3" role="presentation">
        <div className={`w-28 border-t ${line}`} />
        <div className={`w-full border-t ${line}`} />
        <div className={`w-5/6 border-t ${line}`} />
        <div className={`w-2/3 border-t ${line}`} />
      </div>
    </main>
  );
}
