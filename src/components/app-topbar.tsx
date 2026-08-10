import { signOut } from "@/app/(app)/actions";
import type { CurrentProfile } from "@/lib/auth/get-current-profile";

const ROLE_LABEL: Record<CurrentProfile["role"], string> = {
  administrador: "Administrador",
  coordinador: "Coordinador",
  revisor: "Revisor",
  consulta: "Consulta",
};

export function AppTopbar({ profile }: { profile: CurrentProfile }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">{profile.full_name}</p>
          <p className="text-xs text-foreground-muted">{ROLE_LABEL[profile.role]}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
