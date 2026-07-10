export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8" aria-busy="true" aria-label="Loading run">
      <div className="mb-6 h-4 w-56 animate-pulse rounded bg-ink/10" />
      <div className="mb-4 h-6 w-40 animate-pulse rounded bg-ink/10" />
      <div className="h-32 animate-pulse rounded-xl bg-ink/10" />
    </main>
  );
}
