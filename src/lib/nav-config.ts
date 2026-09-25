import type { UserRole } from "@/lib/db/types";

export interface NavItem {
  href: string;
  label: string;
  roles: UserRole[];
}

// Mapa de pantallas (sección 11 del prompt maestro), agrupado y filtrado por rol.
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      {
        href: "/",
        label: "Resumen general",
        roles: ["administrador", "coordinador", "revisor", "consulta", "sgd", "coordinador_eafit"],
      },
      { href: "/mi-bandeja", label: "Mi bandeja de revisión", roles: ["administrador", "coordinador", "revisor"] },
      {
        href: "/sedes",
        label: "Explorador de sedes",
        roles: ["administrador", "coordinador", "revisor", "consulta", "sgd", "coordinador_eafit"],
      },
      {
        href: "/indicadores",
        label: "Indicadores",
        roles: ["administrador", "coordinador", "revisor", "consulta", "sgd", "coordinador_eafit"],
      },
      {
        href: "/mi-cuenta/cambiar-clave",
        label: "Cambiar mi contraseña",
        roles: ["administrador", "coordinador", "revisor", "consulta", "sgd", "coordinador_eafit"],
      },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/admin/usuarios", label: "Usuarios", roles: ["administrador"] },
      { href: "/admin/seguimiento", label: "Seguimiento y calendario", roles: ["administrador"] },
      { href: "/admin/asignaciones", label: "Asignación de sedes", roles: ["administrador", "coordinador"] },
      { href: "/admin/catalogo", label: "Catálogo documental", roles: ["administrador"] },
      { href: "/admin/importaciones", label: "Importación de matrices", roles: ["administrador"] },
      { href: "/admin/errores-importacion", label: "Control de errores de importación", roles: ["administrador"] },
      { href: "/admin/exportaciones", label: "Exportación de resultados", roles: ["administrador", "coordinador"] },
      { href: "/admin/auditoria", label: "Auditoría de acciones", roles: ["administrador"] },
    ],
  },
];

export function navForRole(role: UserRole) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}
