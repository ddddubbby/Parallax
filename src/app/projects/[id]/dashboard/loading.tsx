export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-6 h-4 w-48 animate-pulse rounded bg-ink/10" />
      <div className="mb-4 h-6 w-64 animate-pulse rounded bg-ink/10" />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-ink/10" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-ink/10" />
        <div className="h-40 animate-pulse rounded-xl bg-ink/10" />
      </div>
    </main>
  );
}
