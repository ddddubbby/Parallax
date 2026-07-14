import { ErrorFallback } from "@/components/error-fallback";

export default function NotFound() {
  return (
    <ErrorFallback
      stamp="404 / NO FILE ON RECORD"
      heading="Page not found"
      description="The requested dossier page does not exist in this workspace. Return to the project library to continue."
    />
  );
}
