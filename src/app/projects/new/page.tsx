import { redirect } from "next/navigation";
import { IntakeWizard } from "@/components/intake/wizard";
import { isUuid } from "@/core/id";
import type { IntakeDraft } from "@/core/intake";
import { getProjectIntake } from "@/db/repositories/intake";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; step?: string }>;
}) {
  const { id, step } = await searchParams;

  let projectId: string | null = null;
  let intakeStep = 1;
  let draft: IntakeDraft = {};

  if (id) {
    if (!isUuid(id)) redirect("/projects/new");
    const project = await getProjectIntake(id);
    if (!project) redirect("/projects/new");
    // Post-completion intake editing is out of MVP scope.
    if (project.status !== "draft") redirect("/projects");
    projectId = project.id;
    intakeStep = project.intakeStep;
    draft = (project.intakeDraftJson as IntakeDraft) ?? {};
  }

  const parsedStep = step ? Number.parseInt(step, 10) : null;
  const initialStep =
    parsedStep && parsedStep >= 1 && parsedStep <= 8 ? parsedStep : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <IntakeWizard
        key={projectId ?? "new"}
        projectId={projectId}
        intakeStep={intakeStep}
        draft={draft}
        initialStep={initialStep}
      />
    </main>
  );
}
