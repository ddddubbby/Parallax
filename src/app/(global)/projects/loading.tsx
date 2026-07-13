import { PageLoading } from "@/components/page-loading";

// One boundary covers /projects and everything under /projects/[id]/* —
// the closest Suspense boundary above any changed segment (all paper).
export default function ProjectsLoading() {
  return <PageLoading surface="paper" label="Opening project library" />;
}
