"use client";

import { useEffect } from "react";
import Link from "next/link";

// Red de seguridad para cualquier excepción no capturada al renderizar una pantalla
// dentro de la app (un campo inesperadamente null, un cambio de forma en una vista
// SQL, etc.). Sin esto, un error así tumbaba TODA la página, sin sidebar ni forma de
// volver -- un usuario no técnico (coordinador, mentor) se quedaba varado. Al vivir en
// src/app/(app)/error.tsx, el layout de arriba (sidebar/topbar) sigue renderizado; solo
// se reemplaza el contenido de la pantalla que falló.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Algo salió mal en esta pantalla</h1>
        <p className="text-sm text-foreground-muted">
          No se pudo cargar esta parte de la aplicación. Puedes intentarlo de nuevo o volver al Resumen
          general. Si el problema sigue, avísale al administrador.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary-hover"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          Volver al Resumen general
        </Link>
      </div>
    </div>
  );
}
