import { GLOSSARY_TERMS } from "@/core/semantic";

/**
 * OX-6: wraps an operator-jargon term with its plain-language definition as a
 * native tooltip and a dotted underline affordance. Falls back to plain text
 * if the term has no glossary entry.
 */
export function GlossaryTerm({ term, children }: { term: string; children?: React.ReactNode }) {
  const definition = GLOSSARY_TERMS[term.toLowerCase()];
  const label = children ?? term;
  if (!definition) return <>{label}</>;
  return (
    <abbr
      title={definition}
      className="cursor-help underline decoration-dotted decoration-ink/40 underline-offset-2"
    >
      {label}
    </abbr>
  );
}
