import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedBadge } from "@/components/simulated-badge";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

export default async function ResonancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Resonance
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Resonance</h1>
        <SimulatedBadge />
      </div>
      <section className="rounded-xl border border-ink/15 bg-paper-2/30 p-6">
        <p className="label-mono mb-2 text-xs text-ink/60">LOWER FUNNEL · AVAILABLE AFTER M17</p>
        <p className="max-w-2xl text-sm leading-6 text-ink/75">
          Evidence-conditioned synthetic panel studies will live here. They will use stored audit
          responses as stimulus, keep simulated rows separate from measured audit data, and carry the
          SIMULATED stamp on every surface.
        </p>
      </section>
    </main>
  );
}
