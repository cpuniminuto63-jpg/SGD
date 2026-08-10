export default function RecuperarAccesoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-foreground">Recuperar acceso</h1>
        <p className="mt-4 text-sm text-foreground-muted">
          Por ahora la recuperación de acceso no es autoservicio: no hay un correo institucional
          configurado para enviar enlaces de restablecimiento. Contacta al administrador de
          RevisaSGD — puede generarte una contraseña temporal nueva desde{" "}
          <span className="font-medium text-foreground">Administración → Usuarios</span>.
        </p>

        <p className="mt-6 text-center text-xs text-foreground-muted">
          <a href="/login" className="font-medium text-brand-primary underline-offset-2 hover:underline">
            Volver a inicio de sesión
          </a>
        </p>
      </div>
    </div>
  );
}
