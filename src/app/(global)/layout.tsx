import { Suspense, type ReactNode } from "react";
import { OperatorShell } from "@/components/shell/operator-shell";
import { PageLoading } from "@/components/page-loading";
import { listProjects } from "@/db/repositories/intake";

export const dynamic = "force-dynamic";

/** Global operator chrome for /projects, /projects/new, /settings, /debug (M32 / D-088). */
export default async function GlobalShellLayout({ children }: { children: ReactNode }) {
  const projects = await listProjects();
  return (
    <Suspense fallback={<PageLoading label="Opening operator workspace" />}>
      <OperatorShell
        mode="global"
        projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
      >
        {children}
      </OperatorShell>
    </Suspense>
  );
}
