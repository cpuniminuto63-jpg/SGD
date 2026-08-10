import Image from "next/image";
import Link from "next/link";
import { navForRole } from "@/lib/nav-config";
import type { UserRole } from "@/lib/supabase/database.types";

export function AppSidebar({ role }: { role: UserRole }) {
  const sections = navForRole(role);

  return (
    <nav
      aria-label="Navegación principal"
      className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-9 items-center rounded border border-dashed border-border px-2 text-[10px] font-medium text-foreground-muted">
          UNIMINUTO
        </div>
        <Image
          src="/logos/computadores-para-educar.png"
          alt="Computadores para Educar"
          width={90}
          height={36}
          className="h-9 w-auto object-contain"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          RevisaSGD
        </p>
        {sections.map((section) => (
          <div key={section.title} className="mt-4">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted/80">
              {section.title}
            </p>
            <ul className="mt-1 space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted focus-visible:bg-surface-muted"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
