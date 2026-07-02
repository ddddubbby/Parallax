import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="label-mono text-xs text-ink/55">404 / NO FILE ON RECORD</p>
      <h1 className="mt-4 font-mono text-3xl font-semibold text-ink">
        Page not found
      </h1>
      <p className="mt-3 max-w-xl text-sm text-ink/65">
        The requested dossier page does not exist in this workspace.
      </p>
      <Link
        href="/projects"
        className="label-mono mt-8 inline-flex rounded-full bg-accent px-5 py-2 text-xs text-paper transition-micro hover:bg-accent/90"
      >
        Return to projects
      </Link>
    </main>
  );
}
