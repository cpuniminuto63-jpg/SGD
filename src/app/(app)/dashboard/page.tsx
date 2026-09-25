// /dashboard -- tablero documental por sede y mentor, como componente nativo de la
// app (mismo stack y mismos tokens de diseño que el resto de las pantallas). Lee sus
// datos de /api/tablero, que ya filtra por las sedes visibles del perfil autenticado.
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { DashboardTablero } from "@/components/dashboard-tablero";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  return <DashboardTablero isAdmin={profile.role === "administrador"} />;
}
