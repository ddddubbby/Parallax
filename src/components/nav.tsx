"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/modules/auth/actions";

const SECTIONS = [
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" },
  { href: "/debug", label: "Debug" },
] as const;

// Ink chrome nav: pill chips over either surface (design §6, §8). Active
// section = paper chip (previously hardcoded to Projects, so Settings and
// Debug never showed where you were).
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between bg-ink px-6 py-3">
      <Link
        href="/projects"
        className="label-mono text-sm font-semibold text-paper"
      >
        Parallax
      </Link>
      <nav className="flex items-center gap-2">
        {SECTIONS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`label-mono rounded-full px-4 py-1.5 text-xs transition-micro ${
                active
                  ? "bg-paper text-ink hover:bg-paper-2"
                  : "border border-paper/25 text-paper/70 hover:border-paper hover:text-paper"
              }`}
            >
              {label}
            </Link>
          );
        })}
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
