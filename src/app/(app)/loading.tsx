// Se muestra mientras carga cualquier pantalla de la app (dentro del layout con
// sidebar/topbar) que no tenga su propio loading.tsx más específico -- evita una
// pantalla en blanco mientras una página con varias consultas agregadas (indicadores,
// sedes) resuelve sus datos.
export default function AppLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div
        role="status"
        aria-label="Cargando"
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand-primary"
      />
    </div>
  );
}
