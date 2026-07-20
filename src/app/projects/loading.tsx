import { PageLoading } from "@/components/page-loading";

/** M47/D-118: reachable while the async `projects/[id]` layout awaits data. */
export default function ProjectsSegmentLoading() {
  return <PageLoading label="Opening project workspace" />;
}
