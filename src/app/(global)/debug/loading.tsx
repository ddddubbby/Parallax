import { PageLoading } from "@/components/page-loading";

// Debug is the one ink working surface (DESIGN_GUIDELINES §6) — its
// skeleton matches so there's no paper flash between nav and console.
export default function DebugLoading() {
  return <PageLoading surface="ink" label="Opening operations console" />;
}
