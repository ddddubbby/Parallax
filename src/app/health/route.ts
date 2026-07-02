// Render health check target (render.yaml healthCheckPath). Must answer
// without touching the database or any provider, per RENDER_DEPLOYMENT.md.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "parallax-web" });
}
