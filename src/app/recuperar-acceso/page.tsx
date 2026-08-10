"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "./actions";

const initialState = { ok: false, message: "" };

export default function RecuperarAccesoPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => requestPasswordReset(formData),
    initialState
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-foreground">Recuperar acceso</h1>
        <p className="mt-1 text-center text-sm text-foreground-muted">
          Te enviaremos un enlace seguro a tu correo institucional.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
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
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>

        {state.message ? (
          <div
            role="status"
            className="mt-4 rounded-md border border-brand-secondary/30 bg-brand-secondary/10 px-3 py-2 text-center text-sm text-brand-secondary"
          >
            {state.message}
          </div>
        ) : null}

        <p className="mt-6 text-center text-xs text-foreground-muted">
          <a href="/login" className="font-medium text-brand-primary underline-offset-2 hover:underline">
            Volver a inicio de sesión
          </a>
        </p>
      </div>
    </div>
  );
}
