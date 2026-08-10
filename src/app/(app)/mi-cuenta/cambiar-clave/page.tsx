import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { changePassword } from "./actions";

interface SearchParams {
  error?: string;
  success?: string;
}

export default async function CambiarClavePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Cambiar contraseña</h1>
        <p className="text-sm text-foreground-muted">
          Sesión de <span className="font-medium text-foreground">{profile.email}</span>. Si recibiste una
          contraseña temporal del administrador, cámbiala aquí por una propia.
        </p>
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

      <form action={changePassword} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <label htmlFor="current_password" className="mb-1 block text-sm font-medium text-foreground">
            Contraseña actual
          </label>
          <input
            id="current_password"
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-brand-primary"
          />
        </div>

        <div>
          <label htmlFor="new_password" className="mb-1 block text-sm font-medium text-foreground">
            Contraseña nueva
          </label>
          <input
            id="new_password"
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-brand-primary"
          />
        </div>

        <div>
          <label htmlFor="confirm_password" className="mb-1 block text-sm font-medium text-foreground">
            Confirmar contraseña nueva
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-brand-primary"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
        >
          Guardar nueva contraseña
        </button>
      </form>
    </div>
  );
}
