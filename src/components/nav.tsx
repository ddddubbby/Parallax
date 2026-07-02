import Link from "next/link";

// Ink chrome nav: pill chips over either surface (design §6, §8).
export function Nav() {
  return (
    <header className="flex items-center justify-between bg-ink px-6 py-3">
      <Link
        href="/projects"
        className="label-mono text-sm font-semibold text-paper"
      >
        Parallax
      </Link>
      <nav className="flex items-center gap-2">
        <Link
          href="/projects"
          className="label-mono rounded-full bg-paper px-4 py-1.5 text-xs text-ink transition-micro hover:bg-paper-2"
        >
          Projects
        </Link>
        {/* Settings ships once provider credentials land (PRD §7). */}
        <span className="label-mono cursor-not-allowed rounded-full border border-paper/25 px-4 py-1.5 text-xs text-paper/40">
          Settings
        </span>
        <Link
          href="/debug"
          className="label-mono rounded-full border border-paper/25 px-4 py-1.5 text-xs text-paper/70 transition-micro hover:border-paper hover:text-paper"
        >
          Debug
        </Link>
      </nav>
    </header>
  );
}
