// /dashboard -- el tablero vive en public/dashboard/tablero.html (HTML + JS sin
// dependencias, tal cual se entregó) y lee sus datos de /api/tablero, que ya filtra
// por las sedes visibles del perfil autenticado. El iframe aísla los estilos propios
// del tablero del resto de la app.
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await getCurrentProfile();

  return (
    <iframe
      src="/dashboard/tablero.html"
      title="Dashboard documental"
      style={{ border: 0, width: "100%", height: "calc(100vh - 120px)", borderRadius: 12 }}
    />
  );
}
