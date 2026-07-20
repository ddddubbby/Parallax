import { PageLoading } from "@/components/page-loading";

/** M47/D-118: nested project pages; project chrome from the layout stays mounted. */
export default function ProjectIdLoading() {
  return <PageLoading label="Preparing project view" />;
}
