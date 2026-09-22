import Image from "next/image";
import { signInAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <Image
        src="/sgd-login-tres-logos-v11.png"
        alt=""
        fill
        priority
        aria-hidden
        className="login-bg pointer-events-none select-none object-cover"
      />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface/95 p-8 shadow-lg backdrop-blur-sm">
        <h1 className="text-center text-xl font-semibold text-foreground">RevisaSGD</h1>
        <p className="mt-1 text-center text-sm text-foreground-muted">
          Revisión documental — acceso institucional
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta"
          >
            {error}
          </div>
        ) : null}

        <form action={signInAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next ?? "/"} />

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Correo institucional
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-brand-primary"
              placeholder="nombre@uniminuto.edu"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-brand-primary"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
          >
            Iniciar sesión
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-foreground-muted">
          ¿Olvidaste tu acceso?{" "}
          <a href="/recuperar-acceso" className="font-medium text-brand-primary underline-offset-2 hover:underline">
            Recupérala aquí
          </a>
          . No hay registro público: las cuentas las crea el administrador.
        </p>

        <p className="mt-4 text-center text-[11px] text-foreground-muted/70">
          Desarrollado por Jhonatan Castro
        </p>
      </div>
    </div>
  );
}
