import Link from "next/link";
import { logout } from "@/modules/auth/actions";

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
        <Link
          href="/settings"
          className="label-mono rounded-full border border-paper/25 px-4 py-1.5 text-xs text-paper/70 transition-micro hover:border-paper hover:text-paper"
        >
          Settings
        </Link>
        <Link
          href="/debug"
          className="label-mono rounded-full border border-paper/25 px-4 py-1.5 text-xs text-paper/70 transition-micro hover:border-paper hover:text-paper"
        >
          Debug
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="label-mono cursor-pointer rounded-full border border-paper/25 px-4 py-1.5 text-xs text-paper/70 transition-micro hover:border-paper hover:text-paper"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
