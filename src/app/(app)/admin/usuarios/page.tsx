import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import type { UserRole } from "@/lib/db/types";
import { inviteUser, resetPassword, toggleActive } from "./actions";

const ROLE_LABEL: Record<UserRole, string> = {
  administrador: "Administrador",
  coordinador: "Coordinador",
  revisor: "Revisor",
  consulta: "Consulta",
};

interface SearchParams {
  error?: string;
  success?: string;
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("administrador");
  const params = await searchParams;

  let profilesList: (typeof profiles.$inferSelect)[] = [];
  let loadError: string | null = null;
  try {
    profilesList = await db.select().from(profiles).orderBy(asc(profiles.createdAt));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "error desconocido";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Administración de usuarios</h1>
        <p className="text-sm text-foreground-muted">
          El administrador crea las cuentas iniciales asignando una contraseña temporal. No existe
          registro público de usuarios; para retirar acceso, desactiva la cuenta en lugar de eliminarla.
        </p>
        {!loadError ? (
          <p className="mt-1 text-sm font-medium text-foreground">{profilesList.length} de 8 cuentas creadas</p>
        ) : null}
      </div>

      {params.error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          {params.error}
        </div>
      ) : null}
      {params.success ? (
        <div
          role="status"
          className="rounded-lg border border-status-cumple/30 bg-status-cumple/10 p-4 text-sm text-status-cumple"
        >
          {params.success}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Crear nuevo usuario</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          Se generará una contraseña temporal que se mostrará una sola vez para que la compartas con la
          persona por un canal seguro. Podrá cambiarla desde Mi cuenta.
        </p>
        <form action={inviteUser} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="full_name" className="mb-1 block text-xs font-medium text-foreground-muted">
              Nombre completo
            </label>
            <input
              id="full_name"
              name="full_name"
              required
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-foreground-muted">
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-xs font-medium text-foreground-muted">
              Rol
            </label>
            <select
              id="role"
              name="role"
              defaultValue="revisor"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            >
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Crear usuario
          </button>
        </form>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudieron cargar los usuarios: la base de datos no está conectada todavía ({loadError}).
        </div>
      ) : profilesList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay usuarios creados. Crea la primera cuenta con el formulario de arriba.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Creado</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {profilesList.map((profile) => (
                <tr key={profile.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{profile.fullName}</td>
                  <td className="px-4 py-2 text-foreground-muted">{profile.email}</td>
                  <td className="px-4 py-2 text-foreground">{ROLE_LABEL[profile.role]}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        profile.active
                          ? "rounded-full bg-status-cumple/10 px-2 py-0.5 text-xs font-medium text-status-cumple"
                          : "rounded-full bg-status-no-esta/10 px-2 py-0.5 text-xs font-medium text-status-no-esta"
                      }
                    >
                      {profile.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {new Date(profile.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <form action={resetPassword}>
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
                        >
                          Restablecer clave
                        </button>
                      </form>
                      <form action={toggleActive}>
                        <input type="hidden" name="profile_id" value={profile.id} />
                        <input type="hidden" name="current_active" value={String(profile.active)} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
                        >
                          {profile.active ? "Desactivar" : "Reactivar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
